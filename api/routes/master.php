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
    $gid = (int)($_GET['gudang_id'] ?? 0);
    $sub = $gid ? 'SELECT s.barang_id, SUM(s.qty) total, SUM(s.qty > 0) jml_rak FROM stok s JOIN lokasi l ON l.id = s.lokasi_id WHERE l.gudang_id = ' . $gid . ' GROUP BY s.barang_id'
        : 'SELECT barang_id, SUM(qty) total, SUM(qty > 0) jml_rak FROM stok GROUP BY barang_id';
    return rows("SELECT b.*, COALESCE(t.total, 0) AS total, COALESCE(t.jml_rak, 0) AS jml_rak
        FROM barang b LEFT JOIN ($sub) t ON t.barang_id = b.id
        WHERE " . implode(' AND ', $where) . ' ORDER BY b.nama LIMIT 1000', $p);
});

route('GET', '/barang/:id', function ($a) {
    auth();
    $id = (int)$a['id'];
    $b = row('SELECT * FROM barang WHERE id = ?', [$id]);
    if (!$b) fail('Barang tidak ditemukan', 404);
    $b['stok'] = rows('SELECT s.lokasi_id, l.kode, l.gudang_id, g.nama AS gudang, s.qty FROM stok s JOIN lokasi l ON l.id = s.lokasi_id
        JOIN gudang g ON g.id = l.gudang_id WHERE s.barang_id = ? AND s.qty <> 0 ORDER BY g.id, l.kode', [$id]);
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
    if ($gid = (int)($_GET['gudang_id'] ?? 0)) { $where[] = 'l.gudang_id = ?'; $p[] = $gid; }
    if (($_GET['aktif'] ?? '1') === '1') $where[] = 'l.aktif = 1';
    return rows('SELECT l.*, g.nama AS gudang, COALESCE(t.jml_barang, 0) AS jml_barang, COALESCE(t.total, 0) AS total
        FROM lokasi l JOIN gudang g ON g.id = l.gudang_id
        LEFT JOIN (SELECT lokasi_id, SUM(qty > 0) jml_barang, SUM(qty) total FROM stok GROUP BY lokasi_id) t ON t.lokasi_id = l.id
        WHERE ' . implode(' AND ', $where) . ' ORDER BY l.gudang_id, l.rak, l.tingkat, l.slot, l.kode', $p);
});

route('GET', '/lokasi/:id', function ($a) {
    auth();
    $id = (int)$a['id'];
    $l = row('SELECT l.*, g.nama AS gudang FROM lokasi l JOIN gudang g ON g.id = l.gudang_id WHERE l.id = ?', [$id]);
    if (!$l) fail('Lokasi tidak ditemukan', 404);
    $l['stok'] = rows('SELECT s.barang_id, b.sku, b.nama, b.satuan, s.qty FROM stok s JOIN barang b ON b.id = s.barang_id
        WHERE s.lokasi_id = ? AND s.qty <> 0 ORDER BY b.nama', [$id]);
    $l['mutasi'] = rows(mutasi_sql('(m.lokasi_asal_id = ? OR m.lokasi_tujuan_id = ?)') . ' LIMIT 50', [$id, $id]);
    return $l;
});

function kode_lokasi(string $awalan, string $rak, int $tingkat, int $slot): string
{
    return ($awalan !== '' ? "$awalan-" : '') . sprintf('%s-%02d-%02d', $rak, $tingkat, $slot);
}

function gudang_aktif(int $id): array
{
    $g = row('SELECT * FROM gudang WHERE id = ?', [$id]);
    if (!$g) fail('Pilih gudang');
    if (!(int)$g['aktif']) fail("Gudang {$g['nama']} sudah nonaktif");
    return $g;
}

// Buat banyak lokasi sekaligus: rak A, tingkat 1..N, slot 1..M. Lokasi yang sudah ada dilewati.
route('POST', '/lokasi/generate', function () {
    require_role();
    $b = body();
    $g = gudang_aktif((int)($b['gudang_id'] ?? 1));
    $rak = strtoupper(trim((string)($b['rak'] ?? '')));
    $tingkat = (int)($b['tingkat'] ?? 0);
    $slot = (int)($b['slot'] ?? 0);
    if (!preg_match('/^[A-Z0-9]{1,10}$/', $rak)) fail('Kode rak hanya huruf/angka tanpa spasi, maks 10 karakter');
    if ($tingkat < 1 || $tingkat > 50 || $slot < 1 || $slot > 99) fail('Tingkat 1-50 dan slot 1-99');
    $baru = 0;
    tx(function () use ($g, $rak, $tingkat, $slot, &$baru) {
        for ($t = 1; $t <= $tingkat; $t++) {
            for ($s = 1; $s <= $slot; $s++) {
                $kode = kode_lokasi($g['awalan'], $rak, $t, $s);
                $ada = row('SELECT gudang_id FROM lokasi WHERE kode = ?', [$kode]);
                if ($ada) {
                    if ((int)$ada['gudang_id'] !== (int)$g['id']) fail("Kode $kode sudah dipakai gudang lain");
                    continue;
                }
                insert('lokasi', ['gudang_id' => $g['id'], 'kode' => $kode, 'rak' => $rak, 'tingkat' => $t, 'slot' => $s]);
                $baru++;
            }
        }
    });
    return ['dibuat' => $baru, 'total' => $tingkat * $slot];
});

route('POST', '/lokasi', function () {
    require_role();
    $b = body();
    $g = gudang_aktif((int)($b['gudang_id'] ?? 1));
    $rak = strtoupper(trim((string)($b['rak'] ?? '')));
    $t = (int)($b['tingkat'] ?? 1);
    $s = (int)($b['slot'] ?? 1);
    if (!preg_match('/^[A-Z0-9]{1,10}$/', $rak)) fail('Kode rak hanya huruf/angka tanpa spasi');
    if ($t < 1 || $s < 1) fail('Tingkat dan slot minimal 1');
    $kode = kode_lokasi($g['awalan'], $rak, $t, $s);
    if (val('SELECT id FROM lokasi WHERE kode = ?', [$kode])) fail("Lokasi $kode sudah ada");
    return ['id' => insert('lokasi', ['gudang_id' => $g['id'], 'kode' => $kode, 'rak' => $rak, 'tingkat' => $t, 'slot' => $s,
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

// Lokasi yang pernah dipakai (ada stok, riwayat mutasi, atau masuk opname) tidak boleh dihapus agar riwayat tetap utuh.
function lokasi_terpakai(array $ids): array
{
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    return array_column(rows("SELECT l.id, l.kode FROM lokasi l WHERE l.id IN ($in) AND (
        EXISTS (SELECT 1 FROM stok s WHERE s.lokasi_id = l.id AND s.qty <> 0)
        OR EXISTS (SELECT 1 FROM mutasi m WHERE m.lokasi_asal_id = l.id OR m.lokasi_tujuan_id = l.id)
        OR EXISTS (SELECT 1 FROM opname_item oi WHERE oi.lokasi_id = l.id))", $ids), 'kode', 'id');
}

function hapus_lokasi(array $ids): void
{
    if (!$ids) return;
    $in = implode(',', array_fill(0, count($ids), '?'));
    q("DELETE FROM stok WHERE lokasi_id IN ($in)", $ids);
    q("DELETE FROM lokasi WHERE id IN ($in)", $ids);
}

route('DELETE', '/lokasi/:id', function ($a) {
    require_role();
    $id = (int)$a['id'];
    $kode = val('SELECT kode FROM lokasi WHERE id = ?', [$id]);
    if (!$kode) fail('Lokasi tidak ditemukan', 404);
    if (lokasi_terpakai([$id])) fail("Lokasi $kode sudah punya riwayat stok/transaksi, jadi tidak bisa dihapus. Nonaktifkan saja.");
    tx(fn() => hapus_lokasi([$id]));
    return ['ok' => true];
});

function rak_lokasi(int $gudangId, string $rak): array
{
    $list = rows('SELECT * FROM lokasi WHERE gudang_id = ? AND rak = ? ORDER BY tingkat, slot', [$gudangId, $rak]);
    if (!$list) fail("Rak $rak tidak ditemukan", 404);
    return $list;
}

// Ubah kode rak (mis. A → C, semua lokasinya ikut berganti kode) dan/atau aktif-nonaktifkan seluruh rak.
route('PUT', '/rak/:gudang/:rak', function ($a) {
    require_role();
    $gid = (int)$a['gudang'];
    $rak = strtoupper(rawurldecode($a['rak']));
    $list = rak_lokasi($gid, $rak);
    $g = row('SELECT * FROM gudang WHERE id = ?', [$gid]);
    $b = body();
    $baru = strtoupper(trim((string)($b['rak_baru'] ?? $rak)));
    if (!preg_match('/^[A-Z0-9]{1,10}$/', $baru)) fail('Kode rak hanya huruf/angka tanpa spasi, maks 10 karakter');
    $ids = array_column($list, 'id');
    $in = implode(',', array_fill(0, count($ids), '?'));
    $aktif = array_key_exists('aktif', $b) ? (!empty($b['aktif']) ? 1 : 0) : null;
    $kodeBaru = [];
    if ($aktif === 0 && (float)val("SELECT COALESCE(SUM(qty), 0) FROM stok WHERE lokasi_id IN ($in)", $ids) != 0) {
        fail("Rak $rak masih berisi barang. Pindahkan dulu isinya sebelum dinonaktifkan.");
    }
    if ($baru !== $rak) {
        foreach (rows("SELECT kode, cakupan FROM opname WHERE status = 'hitung' AND gudang_id = ?", [$gid]) as $o) {
            if ($o['cakupan'] === '' || in_array($rak, explode(',', $o['cakupan']), true)) fail("Rak $rak sedang dalam stok opname {$o['kode']}. Selesaikan dulu opnamenya.");
        }
        foreach ($list as $l) $kodeBaru[$l['id']] = kode_lokasi($g['awalan'], $baru, (int)$l['tingkat'], (int)$l['slot']);
        $kin = implode(',', array_fill(0, count($kodeBaru), '?'));
        $bentrok = val("SELECT kode FROM lokasi WHERE kode IN ($kin) AND id NOT IN ($in) LIMIT 1", [...array_values($kodeBaru), ...$ids]);
        if ($bentrok) fail("Kode $bentrok sudah dipakai. Pilih kode rak lain.");
    }
    tx(function () use ($list, $baru, $rak, $aktif, $kodeBaru, $ids, $in) {
        // Kode diganti lewat nilai sementara dulu supaya tidak bentrok dengan UNIQUE saat lokasi dalam satu rak saling bertukar kode.
        if ($baru !== $rak) {
            q("UPDATE lokasi SET kode = CONCAT('~', id) WHERE id IN ($in)", $ids);
            foreach ($list as $l) q('UPDATE lokasi SET kode = ?, rak = ? WHERE id = ?', [$kodeBaru[$l['id']], $baru, $l['id']]);
        }
        if ($aktif !== null) q("UPDATE lokasi SET aktif = ? WHERE id IN ($in)", [$aktif, ...$ids]);
    });
    return ['ok' => true, 'rak' => $baru, 'jumlah' => count($list)];
});

route('DELETE', '/rak/:gudang/:rak', function ($a) {
    require_role();
    $gid = (int)$a['gudang'];
    $rak = strtoupper(rawurldecode($a['rak']));
    $ids = array_column(rak_lokasi($gid, $rak), 'id');
    $pakai = lokasi_terpakai($ids);
    if ($pakai) {
        fail(count($pakai) . ' lokasi di rak ' . $rak . ' sudah punya riwayat stok/transaksi (mis. ' . implode(', ', array_slice($pakai, 0, 3))
            . '), jadi rak tidak bisa dihapus. Nonaktifkan rak, atau hapus lokasi yang kosong satu per satu.');
    }
    tx(fn() => hapus_lokasi($ids));
    return ['ok' => true, 'dihapus' => count($ids)];
});

// ─── Scan: kode bisa berupa kode rak atau SKU barang ────
route('GET', '/scan/:kode', function ($a) {
    auth();
    $kode = strtoupper(trim(rawurldecode($a['kode'])));
    if ($l = row('SELECT l.id, l.kode, l.aktif, l.gudang_id, g.nama AS gudang FROM lokasi l JOIN gudang g ON g.id = l.gudang_id WHERE l.kode = ?', [$kode])) return ['tipe' => 'lokasi'] + $l;
    if ($b = row('SELECT id, sku, nama, satuan, aktif FROM barang WHERE sku = ?', [$kode])) return ['tipe' => 'barang'] + $b;
    fail("Kode $kode tidak dikenal", 404);
});

// ─── Gudang ──────────────────────────────────────────────
route('GET', '/gudang', function () {
    auth();
    return rows('SELECT g.*, COUNT(l.id) AS jml_lokasi, COALESCE(SUM(t.isi), 0) AS lokasi_terisi
        FROM gudang g LEFT JOIN lokasi l ON l.gudang_id = g.id AND l.aktif = 1
        LEFT JOIN (SELECT lokasi_id, 1 AS isi FROM stok WHERE qty > 0 GROUP BY lokasi_id) t ON t.lokasi_id = l.id
        GROUP BY g.id, g.nama, g.awalan, g.alamat, g.aktif, g.created_at ORDER BY g.id');
});

function simpan_gudang(?int $id): array
{
    require_role();
    $b = body();
    $d = [
        'nama' => trim((string)($b['nama'] ?? '')),
        'awalan' => strtoupper(trim((string)($b['awalan'] ?? ''))),
        'alamat' => trim((string)($b['alamat'] ?? '')) ?: null,
        'aktif' => array_key_exists('aktif', $b) ? (!empty($b['aktif']) ? 1 : 0) : 1,
    ];
    if ($d['nama'] === '') fail('Nama gudang wajib diisi');
    if ($d['awalan'] !== '' && !preg_match('/^[A-Z0-9]{1,10}$/', $d['awalan'])) fail('Awalan kode hanya huruf/angka tanpa spasi, maks 10 karakter');
    if (val('SELECT id FROM gudang WHERE awalan = ? AND id <> ?', [$d['awalan'], $id ?? 0])) {
        fail($d['awalan'] === '' ? 'Sudah ada gudang tanpa awalan. Gudang baru wajib punya awalan kode, mis. G2' : "Awalan {$d['awalan']} sudah dipakai gudang lain");
    }
    if ($id) {
        $lama = row('SELECT * FROM gudang WHERE id = ?', [$id]);
        if (!$lama) fail('Gudang tidak ditemukan', 404);
        // Awalan ikut tercetak di label rak, jadi tidak boleh diubah setelah gudang punya lokasi.
        if ($lama['awalan'] !== $d['awalan'] && val('SELECT id FROM lokasi WHERE gudang_id = ? LIMIT 1', [$id])) {
            fail('Awalan tidak bisa diubah karena gudang ini sudah punya rak berlabel');
        }
        if (!$d['aktif'] && (float)val('SELECT COALESCE(SUM(s.qty), 0) FROM stok s JOIN lokasi l ON l.id = s.lokasi_id WHERE l.gudang_id = ?', [$id]) != 0) {
            fail('Gudang masih berisi barang. Pindahkan dulu isinya sebelum dinonaktifkan.');
        }
        update('gudang', $id, $d);
    } else {
        $id = insert('gudang', $d);
    }
    return ['id' => $id];
}

route('POST', '/gudang', fn() => simpan_gudang(null));
route('PUT', '/gudang/:id', fn($a) => simpan_gudang((int)$a['id']));
