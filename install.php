<?php
// Sengaja ditulis dengan sintaks PHP lama agar pesan syarat server tetap tampil di hosting dengan PHP usang.
$problems = array();
if (version_compare(PHP_VERSION, '8.1.0', '<')) {
    $problems[] = 'Versi PHP server ' . PHP_VERSION . ' terlalu lama. Ubah ke <b>PHP 8.1 atau lebih baru</b> lewat menu '
        . '<i>PHP Configuration</i> (hPanel Hostinger) atau <i>Select PHP Version</i> (cPanel).';
}
foreach (array('pdo_mysql', 'json', 'mbstring') as $ext) {
    if (!extension_loaded($ext)) {
        $problems[] = 'Ekstensi PHP <b>' . $ext . '</b> belum aktif. Aktifkan di pengaturan PHP hosting.';
    }
}
if (!is_file(dirname(__FILE__) . '/api/config.php') && !is_writable(dirname(__FILE__) . '/api')) {
    $problems[] = 'Folder <b>api/</b> tidak bisa ditulis. Ubah permission folder <code>api</code> menjadi 755 lewat File Manager.';
}
if (!is_file(dirname(__FILE__) . '/sql/schema.sql')) {
    $problems[] = 'File <b>sql/schema.sql</b> tidak ditemukan. Pastikan semua folder ikut terupload.';
}

if ($problems) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Install RakStok</title></head>'
        . '<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f1f5f9;padding:24px 16px;color:#0f172a">'
        . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:28px">'
        . '<h1 style="font-size:20px;margin:0 0 12px">Server belum memenuhi syarat</h1><ul style="padding-left:18px;line-height:1.6">';
    foreach ($problems as $p) echo '<li style="margin-bottom:8px">' . $p . '</li>';
    echo '</ul><p style="color:#64748b">Setelah diperbaiki, muat ulang halaman ini.</p></div></body></html>';
    exit;
}

$ROOT = dirname(__FILE__);
require $ROOT . '/api/lib/installer.php';
