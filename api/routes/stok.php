<?php

function mutasi_sql(string $where): string
{
    return "SELECT m.*, b.sku, b.nama AS barang, b.satuan, la.kode AS asal, lt.kode AS tujuan, u.nama AS oleh
        FROM mutasi m
        JOIN barang b ON b.id = m.barang_id
        LEFT JOIN lokasi la ON la.id = m.lokasi_asal_id
        LEFT JOIN lokasi lt ON lt.id = m.lokasi_tujuan_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE $where ORDER BY m.id DESC";
}

// Satu transaksi bisa berisi banyak baris barang (mis. satu surat jalan). Semua baris berhasil atau semua batal.
route('POST', '/transaksi', function () {
    $u = auth();
    $b = body();
    $jenis = (string)($b['jenis'] ?? '');
    if (!in_array($jenis, ['masuk', 'keluar', 'pindah'], true)) fail('Jenis transaksi tidak valid');
    $items = $b['items'] ?? [];
    if (!is_array($items) || !$items) fail('Tambahkan minimal satu barang');
    if (count($items) > 200) fail('Maksimal 200 baris per transaksi');
    $ids = tx(function () use ($items, $jenis, $b, $u) {
        $ids = [];
        foreach ($items as $i => $it) {
            try {
                $ids[] = catat_mutasi([
                    'jenis' => $jenis,
                    'tanggal' => $b['tanggal'] ?? null,
                    'referensi' => $b['referensi'] ?? null,
                    'catatan' => $it['catatan'] ?? ($b['catatan'] ?? null),
                    'barang_id' => $it['barang_id'] ?? 0,
                    'lokasi_asal_id' => $it['lokasi_asal_id'] ?? null,
                    'lokasi_tujuan_id' => $it['lokasi_tujuan_id'] ?? null,
                    'qty' => $it['qty'] ?? 0,
                ], (int)$u['id']);
            } catch (ApiError $e) {
                fail('Baris ' . ($i + 1) . ': ' . $e->getMessage());
            }
        }
        return $ids;
    });
    return ['ok' => true, 'jumlah' => count($ids)];
});

route('POST', '/transaksi/cek-opname', function () {
    auth();
    return ['opname' => rak_sedang_opname((array)(body()['lokasi_ids'] ?? []))];
});

route('GET', '/mutasi', function () {
    auth();
    $where = ['1=1'];
    $p = [];
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d = (string)($_GET['dari'] ?? ''))) { $where[] = 'm.tanggal >= ?'; $p[] = $d; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d = (string)($_GET['sampai'] ?? ''))) { $where[] = 'm.tanggal <= ?'; $p[] = $d; }
    if (in_array($j = (string)($_GET['jenis'] ?? ''), JENIS_MUTASI, true)) { $where[] = 'm.jenis = ?'; $p[] = $j; }
    if (($s = trim((string)($_GET['q'] ?? ''))) !== '') {
        $where[] = '(b.sku LIKE ? OR b.nama LIKE ? OR m.referensi LIKE ? OR la.kode LIKE ? OR lt.kode LIKE ?)';
        array_push($p, "%$s%", "%$s%", "%$s%", "$s%", "$s%");
    }
    $limit = ($_GET['export'] ?? '') === '1' ? 20000 : 500;
    return rows(mutasi_sql(implode(' AND ', $where)) . " LIMIT $limit", $p);
});

// Saldo stok per barang per rak.
route('GET', '/stok', function () {
    auth();
    $where = ['s.qty <> 0'];
    $p = [];
    if (($s = trim((string)($_GET['q'] ?? ''))) !== '') {
        $where[] = '(b.sku LIKE ? OR b.nama LIKE ? OR l.kode LIKE ?)';
        array_push($p, "%$s%", "%$s%", "$s%");
    }
    if (($r = trim((string)($_GET['rak'] ?? ''))) !== '') { $where[] = 'l.rak = ?'; $p[] = $r; }
    if (($k = trim((string)($_GET['kategori'] ?? ''))) !== '') { $where[] = 'b.kategori = ?'; $p[] = $k; }
    $order = ($_GET['urut'] ?? '') === 'rak' ? 'l.rak, l.tingkat, l.slot, b.nama' : 'b.nama, l.kode';
    return rows('SELECT s.barang_id, s.lokasi_id, s.qty, b.sku, b.nama, b.kategori, b.satuan, l.kode, l.rak
        FROM stok s JOIN barang b ON b.id = s.barang_id JOIN lokasi l ON l.id = s.lokasi_id
        WHERE ' . implode(' AND ', $where) . " ORDER BY $order LIMIT 5000", $p);
});

route('GET', '/dashboard', function () {
    auth();
    $today = date('Y-m-d');
    return [
        'jml_barang' => (int)val('SELECT COUNT(*) FROM barang WHERE aktif = 1'),
        'jml_lokasi' => (int)val('SELECT COUNT(*) FROM lokasi WHERE aktif = 1'),
        'lokasi_terisi' => (int)val('SELECT COUNT(DISTINCT lokasi_id) FROM stok WHERE qty > 0'),
        'hari_ini' => rows('SELECT jenis, COUNT(*) n FROM mutasi WHERE tanggal = ? GROUP BY jenis', [$today]),
        'menipis' => rows('SELECT b.id, b.sku, b.nama, b.satuan, b.stok_min, COALESCE(SUM(s.qty), 0) total
            FROM barang b LEFT JOIN stok s ON s.barang_id = b.id
            WHERE b.aktif = 1 AND b.stok_min > 0 GROUP BY b.id HAVING total < b.stok_min ORDER BY total / b.stok_min LIMIT 20'),
        'opname_aktif' => rows("SELECT id, kode, tanggal, cakupan FROM opname WHERE status = 'hitung' ORDER BY id DESC"),
        'terakhir' => rows(mutasi_sql('1=1') . ' LIMIT 10'),
    ];
});
