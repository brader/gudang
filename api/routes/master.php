<?php

// ─── Barang ──────────────────────────────────────────────
route('GET', '/barang', function () {
    auth();
    $where = ['1=1'];
    $p = [];
    if (($s = trim((string)($_GET['q'] ?? ''))) !== '') {
        $where[] = '(b.sku LIKE ? OR b.nama LIKE ?)';
        array_push($p, "%$s%", "%$s%");
    }
    if (($k = trim((string)($_GET['kategori'] ?? ''))) !== '') { $where[] = 'b.kategori = ?'; $p[] = $k; }
    if (($_GET['aktif'] ?? '1') === '1') $where[] = 'b.aktif = 1';
    if (($_GET['menipis'] ?? '') === '1') $where[] = 'b.stok_min > 0 AND COALESCE(t.total, 0) < b.stok_min';
    return rows('SELECT b.*, COALESCE(t.total, 0) AS total, COALESCE(t.jml_rak, 0) AS jml_rak
        FROM barang b
        LEFT JOIN (SELECT barang_id, SUM(qty) total, SUM(qty > 0) jml_rak FROM stok GROUP BY barang_id) t ON t.barang_id = b.id
        WHERE ' . implode(' AND ', $where) . ' ORDER BY b.nama LIMIT 1000', $p);
});

route('GET', '/barang/:id', function ($a) {
    auth();
    $id = (int)$a['id'];
    $b = row('SELECT * FROM barang WHERE id = ?', [$id]);
    if (!$b) fail('Barang tidak ditemukan', 404);
    $b['stok'] = rows('SELECT s.lokasi_id, l.kode, s.qty FROM stok s JOIN lokasi l ON l.id = s.lokasi_id
        WHERE s.barang_id = ? AND s.qty <> 0 ORDER BY l.kode', [$id]);
    $b['total'] = array_sum(array_map(fn($r) => (float)$r['qty'], $b['stok']));
    $b['mutasi'] = rows(mutasi_sql('m.barang_id = ?') . ' LIMIT 50', [$id]);
    return $b;
});

function simpan_barang(?int $id): array
{
    require_role();
    $b = body();
    $d = [
        'sku' => strtoupper(trim((string)($b['sku'] ?? ''))),
        'nama' => trim((string)($b['nama'] ?? '')),
        'kategori' => trim((string)($b['kategori'] ?? '')) ?: null,
        'satuan' => trim((string)($b['satuan'] ?? '')) ?: 'pcs',
        'stok_min' => max(0, num($b['stok_min'] ?? 0)),
        'aktif' => array_key_exists('aktif', $b) ? (!empty($b['aktif']) ? 1 : 0) : 1,
    ];
    if ($d['sku'] === '') fail('SKU / kode barang wajib diisi');
    if (preg_match('/\s/', $d['sku'])) fail('SKU tidak boleh mengandung spasi');
    if ($d['nama'] === '') fail('Nama barang wajib diisi');
    if (val('SELECT id FROM barang WHERE sku = ? AND id <> ?', [$d['sku'], $id ?? 0])) fail("SKU {$d['sku']} sudah dipakai barang lain");
    if (val('SELECT id FROM lokasi WHERE kode = ?', [$d['sku']])) fail("SKU {$d['sku']} sama dengan kode rak, pakai kode lain");
    if ($id) update('barang', $id, $d); else $id = insert('barang', $d);
    return ['id' => $id];
}

route('POST', '/barang', fn() => simpan_barang(null));
route('PUT', '/barang/:id', fn($a) => simpan_barang((int)$a['id']));

// ─── Lokasi / Rak ────────────────────────────────────────
route('GET', '/lokasi', function () {
    auth();
    $where = ['1=1'];
    $p = [];
    if (($r = trim((string)($_GET['rak'] ?? ''))) !== '') { $where[] = 'l.rak = ?'; $p[] = $r; }
    if (($_GET['aktif'] ?? '1') === '1') $where[] = 'l.aktif = 1';
    return rows('SELECT l.*, COALESCE(t.jml_barang, 0) AS jml_barang, COALESCE(t.total, 0) AS total
        FROM lokasi l
        LEFT JOIN (SELECT lokasi_id, SUM(qty > 0) jml_barang, SUM(qty) total FROM stok GROUP BY lokasi_id) t ON t.lokasi_id = l.id
        WHERE ' . implode(' AND ', $where) . ' ORDER BY l.rak, l.tingkat, l.slot, l.kode', $p);
});

route('GET', '/lokasi/:id', function ($a) {
    auth();
    $id = (int)$a['id'];
    $l = row('SELECT * FROM lokasi WHERE id = ?', [$id]);
    if (!$l) fail('Lokasi tidak ditemukan', 404);
    $l['stok'] = rows('SELECT s.barang_id, b.sku, b.nama, b.satuan, s.qty FROM stok s JOIN barang b ON b.id = s.barang_id
        WHERE s.lokasi_id = ? AND s.qty <> 0 ORDER BY b.nama', [$id]);
    $l['mutasi'] = rows(mutasi_sql('(m.lokasi_asal_id = ? OR m.lokasi_tujuan_id = ?)') . ' LIMIT 50', [$id, $id]);
    return $l;
});

function kode_lokasi(string $rak, int $tingkat, int $slot): string
{
    return sprintf('%s-%02d-%02d', $rak, $tingkat, $slot);
}

// Buat banyak lokasi sekaligus: rak A, tingkat 1..N, slot 1..M. Lokasi yang sudah ada dilewati.
route('POST', '/lokasi/generate', function () {
    require_role();
    $b = body();
    $rak = strtoupper(trim((string)($b['rak'] ?? '')));
    $tingkat = (int)($b['tingkat'] ?? 0);
    $slot = (int)($b['slot'] ?? 0);
    if (!preg_match('/^[A-Z0-9]{1,10}$/', $rak)) fail('Kode rak hanya huruf/angka tanpa spasi, maks 10 karakter');
    if ($tingkat < 1 || $tingkat > 50 || $slot < 1 || $slot > 99) fail('Tingkat 1-50 dan slot 1-99');
    $baru = 0;
    tx(function () use ($rak, $tingkat, $slot, &$baru) {
        for ($t = 1; $t <= $tingkat; $t++) {
            for ($s = 1; $s <= $slot; $s++) {
                $baru += q('INSERT IGNORE INTO lokasi (kode, rak, tingkat, slot) VALUES (?, ?, ?, ?)',
                    [kode_lokasi($rak, $t, $s), $rak, $t, $s])->rowCount();
            }
        }
    });
    return ['dibuat' => $baru, 'total' => $tingkat * $slot];
});

route('POST', '/lokasi', function () {
    require_role();
    $b = body();
    $rak = strtoupper(trim((string)($b['rak'] ?? '')));
    $t = (int)($b['tingkat'] ?? 1);
    $s = (int)($b['slot'] ?? 1);
    if (!preg_match('/^[A-Z0-9]{1,10}$/', $rak)) fail('Kode rak hanya huruf/angka tanpa spasi');
    if ($t < 1 || $s < 1) fail('Tingkat dan slot minimal 1');
    $kode = kode_lokasi($rak, $t, $s);
    if (val('SELECT id FROM lokasi WHERE kode = ?', [$kode])) fail("Lokasi $kode sudah ada");
    return ['id' => insert('lokasi', ['kode' => $kode, 'rak' => $rak, 'tingkat' => $t, 'slot' => $s,
        'keterangan' => trim((string)($b['keterangan'] ?? '')) ?: null])];
});

route('PUT', '/lokasi/:id', function ($a) {
    require_role();
    $id = (int)$a['id'];
    $b = body();
    $aktif = !empty($b['aktif']) ? 1 : 0;
    if (!$aktif && (float)val('SELECT COALESCE(SUM(qty), 0) FROM stok WHERE lokasi_id = ?', [$id]) != 0) {
        fail('Rak masih berisi barang. Pindahkan dulu isinya sebelum dinonaktifkan.');
    }
    update('lokasi', $id, ['keterangan' => trim((string)($b['keterangan'] ?? '')) ?: null, 'aktif' => $aktif]);
    return ['ok' => true];
});

// ─── Scan: kode bisa berupa kode rak atau SKU barang ────
route('GET', '/scan/:kode', function ($a) {
    auth();
    $kode = strtoupper(trim(rawurldecode($a['kode'])));
    if ($l = row('SELECT id, kode, aktif FROM lokasi WHERE kode = ?', [$kode])) return ['tipe' => 'lokasi'] + $l;
    if ($b = row('SELECT id, sku, nama, satuan, aktif FROM barang WHERE sku = ?', [$kode])) return ['tipe' => 'barang'] + $b;
    fail("Kode $kode tidak dikenal", 404);
});
