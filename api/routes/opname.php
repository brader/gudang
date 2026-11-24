<?php

function opname_get(int $id): array
{
    $o = row('SELECT o.*, u.nama AS dibuat_nama, u2.nama AS selesai_nama FROM opname o
        LEFT JOIN users u ON u.id = o.dibuat_oleh LEFT JOIN users u2 ON u2.id = o.diselesaikan_oleh WHERE o.id = ?', [$id]);
    if (!$o) fail('Sesi opname tidak ditemukan', 404);
    return $o;
}

route('GET', '/opname', function () {
    auth();
    return rows('SELECT o.*, u.nama AS dibuat_nama,
            (SELECT COUNT(*) FROM opname_item WHERE opname_id = o.id) jml_item,
            (SELECT COUNT(*) FROM opname_item WHERE opname_id = o.id AND qty_fisik IS NOT NULL) jml_dihitung,
            (SELECT COUNT(*) FROM opname_item WHERE opname_id = o.id AND qty_fisik IS NOT NULL AND qty_fisik <> qty_sistem) jml_selisih
        FROM opname o LEFT JOIN users u ON u.id = o.dibuat_oleh ORDER BY o.id DESC LIMIT 200');
});

route('POST', '/opname', function () {
    $u = require_role();
    $b = body();
    $rak = array_values(array_unique(array_filter(array_map(fn($r) => strtoupper(trim((string)$r)), (array)($b['rak'] ?? [])))));
    $id = tx(function () use ($u, $b, $rak) {
        $id = insert('opname', [
            'kode' => next_code('opname', 'SO'),
            'tanggal' => date('Y-m-d'),
            'cakupan' => implode(',', $rak),
            'status' => 'hitung',
            'catatan' => trim((string)($b['catatan'] ?? '')) ?: null,
            'dibuat_oleh' => $u['id'],
        ]);
        // Snapshot saldo sistem saat sesi dibuka.
        $where = 's.qty <> 0 AND l.aktif = 1';
        $p = [$id];
        if ($rak) { $where .= ' AND l.rak IN (' . implode(',', array_fill(0, count($rak), '?')) . ')'; array_push($p, ...$rak); }
        q("INSERT INTO opname_item (opname_id, barang_id, lokasi_id, qty_sistem)
           SELECT ?, s.barang_id, s.lokasi_id, s.qty FROM stok s JOIN lokasi l ON l.id = s.lokasi_id WHERE $where", $p);
        return $id;
    });
    return ['id' => $id];
});

route('GET', '/opname/:id', function ($a) {
    auth();
    $id = (int)$a['id'];
    $o = opname_get($id);
    $o['items'] = rows('SELECT oi.*, b.sku, b.nama, b.satuan, l.kode, l.rak, u.nama AS dihitung_nama
        FROM opname_item oi JOIN barang b ON b.id = oi.barang_id JOIN lokasi l ON l.id = oi.lokasi_id
        LEFT JOIN users u ON u.id = oi.dihitung_oleh
        WHERE oi.opname_id = ? ORDER BY l.rak, l.tingkat, l.slot, b.nama', [$id]);
    $o['lokasi'] = rows('SELECT id, kode, rak FROM lokasi WHERE aktif = 1' .
        ($o['cakupan'] !== '' ? ' AND FIND_IN_SET(rak, ?)' : '') . ' ORDER BY rak, tingkat, slot',
        $o['cakupan'] !== '' ? [$o['cakupan']] : []);
    return $o;
});

function opname_terbuka(int $id): array
{
    $o = opname_get($id);
    if ($o['status'] !== 'hitung') fail('Sesi opname sudah selesai / dibatalkan');
    return $o;
}

// Simpan hasil hitung satu atau beberapa baris. Barang yang belum ada di daftar rak itu ditambahkan dengan qty_sistem 0.
route('POST', '/opname/:id/hitung', function ($a) {
    $u = auth();
    $id = (int)$a['id'];
    $o = opname_terbuka($id);
    $cak = $o['cakupan'] === '' ? null : explode(',', $o['cakupan']);
    $items = (array)(body()['items'] ?? []);
    tx(function () use ($items, $id, $u, $cak) {
        foreach ($items as $it) {
            $bid = (int)($it['barang_id'] ?? 0);
            $lid = (int)($it['lokasi_id'] ?? 0);
            $fisik = ($it['qty_fisik'] ?? '') === '' || ($it['qty_fisik'] ?? null) === null ? null : num($it['qty_fisik']);
            if ($fisik !== null && $fisik < 0) fail('Jumlah fisik tidak boleh minus');
            $lok = lokasi_aktif($lid);
            if ($cak !== null && !in_array($lok['rak'], $cak, true)) fail("Rak {$lok['kode']} di luar cakupan opname ini");
            barang_aktif($bid);
            $sistem = (float)(val('SELECT qty FROM stok WHERE barang_id = ? AND lokasi_id = ?', [$bid, $lid]) ?? 0);
            $ada = val('SELECT id FROM opname_item WHERE opname_id = ? AND barang_id = ? AND lokasi_id = ?', [$id, $bid, $lid]);
            if ($ada) {
                q('UPDATE opname_item SET qty_sistem = ?, qty_fisik = ?, dihitung_oleh = ?, dihitung_at = ? WHERE id = ?',
                    [$sistem, $fisik, $fisik === null ? null : $u['id'], $fisik === null ? null : date('Y-m-d H:i:s'), $ada]);
            } else {
                insert('opname_item', ['opname_id' => $id, 'barang_id' => $bid, 'lokasi_id' => $lid, 'qty_sistem' => $sistem,
                    'qty_fisik' => $fisik, 'dihitung_oleh' => $fisik === null ? null : $u['id'], 'dihitung_at' => $fisik === null ? null : date('Y-m-d H:i:s')]);
            }
        }
    });
    return ['ok' => true];
});

// qty_sistem diperbarui setiap kali baris dihitung, jadi selisih = fisik - saldo saat dihitung.
// Selisih itu diterapkan ke saldo sekarang agar transaksi setelah penghitungan tidak tertimpa. Baris yang belum dihitung dilewati.
route('POST', '/opname/:id/selesai', function ($a) {
    $u = require_role();
    $id = (int)$a['id'];
    $jml = tx(function () use ($id, $u) {
        $o = row('SELECT * FROM opname WHERE id = ? FOR UPDATE', [$id]);
        if (!$o || $o['status'] !== 'hitung') fail('Sesi opname sudah selesai / dibatalkan');
        $items = rows('SELECT * FROM opname_item WHERE opname_id = ? AND qty_fisik IS NOT NULL', [$id]);
        $n = 0;
        foreach ($items as $it) {
            $selisih = round((float)$it['qty_fisik'] - (float)$it['qty_sistem'], 2);
            if ($selisih == 0) continue;
            catat_mutasi([
                'jenis' => 'koreksi', 'barang_id' => $it['barang_id'], 'lokasi_tujuan_id' => $it['lokasi_id'],
                'qty' => $selisih, 'referensi' => $o['kode'], 'catatan' => 'Stok opname', 'opname_id' => $id,
            ], (int)$u['id']);
            $n++;
        }
        q("UPDATE opname SET status = 'selesai', diselesaikan_oleh = ?, selesai_at = NOW() WHERE id = ?", [$u['id'], $id]);
        return $n;
    });
    return ['ok' => true, 'koreksi' => $jml];
});

route('POST', '/opname/:id/batal', function ($a) {
    require_role();
    $id = (int)$a['id'];
    opname_terbuka($id);
    q("UPDATE opname SET status = 'batal' WHERE id = ?", [$id]);
    return ['ok' => true];
});
