<?php

const JENIS_MUTASI = ['masuk', 'keluar', 'pindah', 'koreksi'];
const PERAN = ['admin' => 'Admin', 'staf' => 'Staf Gudang'];

// Dipanggil di dalam tx(). Baris stok dikunci agar dua transaksi bersamaan tidak membuat stok minus.
function ubah_stok(int $barangId, int $lokasiId, float $delta): float
{
    q('INSERT IGNORE INTO stok (barang_id, lokasi_id, qty) VALUES (?, ?, 0)', [$barangId, $lokasiId]);
    $qty = (float)val('SELECT qty FROM stok WHERE barang_id = ? AND lokasi_id = ? FOR UPDATE', [$barangId, $lokasiId]);
    $baru = round($qty + $delta, 2);
    if ($baru < 0) {
        $b = row('SELECT nama, satuan FROM barang WHERE id = ?', [$barangId]);
        $l = val('SELECT kode FROM lokasi WHERE id = ?', [$lokasiId]);
        fail(sprintf('Stok %s di rak %s hanya %s %s', $b['nama'] ?? '?', $l ?? '?', fmt_qty($qty), $b['satuan'] ?? ''));
    }
    q('UPDATE stok SET qty = ? WHERE barang_id = ? AND lokasi_id = ?', [$baru, $barangId, $lokasiId]);
    return $baru;
}

function fmt_qty(float $n): string
{
    return rtrim(rtrim(number_format($n, 2, ',', '.'), '0'), ',');
}

function barang_aktif(int $id): array
{
    $b = row('SELECT * FROM barang WHERE id = ?', [$id]);
    if (!$b) fail('Barang tidak ditemukan');
    if (!(int)$b['aktif']) fail("Barang {$b['nama']} sudah nonaktif");
    return $b;
}

function lokasi_aktif(int $id): array
{
    $l = row('SELECT * FROM lokasi WHERE id = ?', [$id]);
    if (!$l) fail('Lokasi rak tidak ditemukan');
    if (!(int)$l['aktif']) fail("Rak {$l['kode']} sudah nonaktif");
    return $l;
}

// Catat satu mutasi + ubah saldo stok. Untuk koreksi, qty boleh negatif (selisih).
function catat_mutasi(array $m, int $userId): int
{
    $jenis = $m['jenis'];
    $qty = num($m['qty']);
    $barangId = (int)$m['barang_id'];
    $asal = !empty($m['lokasi_asal_id']) ? (int)$m['lokasi_asal_id'] : null;
    $tujuan = !empty($m['lokasi_tujuan_id']) ? (int)$m['lokasi_tujuan_id'] : null;
    if (!in_array($jenis, JENIS_MUTASI, true)) fail('Jenis transaksi tidak valid');
    if ($jenis !== 'koreksi' && $qty <= 0) fail('Jumlah harus lebih dari 0');
    if ($jenis === 'koreksi' && $qty == 0) fail('Jumlah koreksi tidak boleh 0');
    barang_aktif($barangId);

    if ($jenis === 'masuk') {
        if (!$tujuan) fail('Pilih rak tujuan');
        lokasi_aktif($tujuan);
        ubah_stok($barangId, $tujuan, $qty);
        $asal = null;
    } elseif ($jenis === 'keluar') {
        if (!$asal) fail('Pilih rak asal');
        ubah_stok($barangId, $asal, -$qty);
        $tujuan = null;
    } elseif ($jenis === 'pindah') {
        if (!$asal || !$tujuan) fail('Pilih rak asal dan rak tujuan');
        if ($asal === $tujuan) fail('Rak asal dan tujuan tidak boleh sama');
        lokasi_aktif($tujuan);
        ubah_stok($barangId, $asal, -$qty);
        ubah_stok($barangId, $tujuan, $qty);
    } else {
        $lok = $tujuan ?: $asal;
        if (!$lok) fail('Pilih rak yang dikoreksi');
        ubah_stok($barangId, $lok, $qty);
        $asal = $qty < 0 ? $lok : null;
        $tujuan = $qty > 0 ? $lok : null;
        $qty = abs($qty);
    }

    $tgl = (string)($m['tanggal'] ?? '');
    return insert('mutasi', [
        'tanggal' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $tgl) ? $tgl : date('Y-m-d'),
        'jenis' => $jenis,
        'barang_id' => $barangId,
        'lokasi_asal_id' => $asal,
        'lokasi_tujuan_id' => $tujuan,
        'qty' => $qty,
        'referensi' => trim((string)($m['referensi'] ?? '')) ?: null,
        'catatan' => trim((string)($m['catatan'] ?? '')) ?: null,
        'opname_id' => $m['opname_id'] ?? null,
        'user_id' => $userId,
    ]);
}

// Rak yang sedang dalam opname aktif (untuk peringatan saat transaksi).
function rak_sedang_opname(array $lokasiIds): array
{
    $lokasiIds = array_values(array_filter(array_map('intval', $lokasiIds)));
    if (!$lokasiIds) return [];
    $aktif = rows("SELECT kode, cakupan FROM opname WHERE status = 'hitung'");
    if (!$aktif) return [];
    $in = implode(',', array_fill(0, count($lokasiIds), '?'));
    $rak = array_column(rows("SELECT DISTINCT rak FROM lokasi WHERE id IN ($in)", $lokasiIds), 'rak');
    $out = [];
    foreach ($aktif as $o) {
        $cak = $o['cakupan'] === '' ? null : explode(',', $o['cakupan']);
        if ($cak === null || array_intersect($rak, $cak)) $out[] = $o['kode'];
    }
    return $out;
}
