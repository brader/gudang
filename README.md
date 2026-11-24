# RakStok — Pencatatan Gudang per Rak

Aplikasi stok gudang sederhana: barang, lokasi rak berlabel QR, transaksi masuk/keluar/pindah, riwayat mutasi, dan stok opname.
PHP 8.1+ native + MySQL/MariaDB, bisa dipasang di cPanel shared hosting.

## Install di cPanel
1. Buat database + user MySQL di cPanel (**MySQL Databases**), beri user akses ALL ke database.
2. Upload isi paket (zip dari `git archive`, lihat bawah) ke folder tujuan, mis. `public_html/gudang`, lalu Extract.
3. Buka `https://domain-anda/gudang/install.php`, isi data database + akun admin.
4. Setelah berhasil, **hapus `install.php`** lewat File Manager.
5. Pastikan ekstensi PHP `pdo_mysql`, `curl`, `zip` aktif (cPanel → Select PHP Version → Extensions).

## Multi gudang (sejak v1.5)
Menu **Gudang** (admin): tambah gudang dengan **awalan kode**, mis. `CKR` → rak `CKR-A-01-01`. Gudang lama otomatis jadi
"Gudang Utama" tanpa awalan, jadi label lama tetap berlaku. Pilihan gudang di kanan atas menyaring tampilan;
pindah barang antar gudang lewat Transaksi → Pindah Rak. **Backup database** (phpMyAdmin → Export) sebelum update ke v1.5.

## Scan pakai HP (PWA)
Buka `https://domain-anda/gudang/scan/` di HP (atau menu **📷 Scan HP** di aplikasi), login, lalu
**Tambahkan ke Layar Utama** (Chrome: menu ⋮ → Install app; Safari: Bagikan → Add to Home Screen).
Mode: Cek, Masuk, Keluar, Pindah, Opname. Kamera hanya jalan di **https**.

## Update otomatis dari GitHub
Menu **Pengaturan → Update Aplikasi** (khusus admin):
1. Buka *Pengaturan sumber update*, isi repo (`brader/gudang`), branch (`main`), dan **token GitHub**.
   Buat token di GitHub → Settings → Developer settings → *Fine-grained tokens*: pilih repo ini saja, izin **Contents: Read-only**.
2. Klik **Cek Update** → **Update Sekarang**. File lama otomatis dibackup ke `storage/backups` (3 terakhir disimpan)
   dan bisa dikembalikan dari menu yang sama. Perubahan database (file `sql/migrations/*.sql`) dijalankan otomatis.

File yang tidak pernah ditimpa update: `api/config.php`, `install.php`, folder `storage/`.
Token disimpan di database server, tidak pernah dikirim ke browser.

## Penomoran versi
Versi ada di file `VERSION` (mis. `1.2`) dan tampil sebagai **v1.2** di aplikasi. Setiap rilis: naikkan `VERSION`
(1.2 → 1.3 → …), commit, beri tag `v1.3`, lalu push. Updater hanya menawarkan update jika versi di GitHub lebih tinggi.

## Membuat paket upload
```bash
git archive --format=zip -o rakstok-upload.zip HEAD
```
`api/version.php` otomatis terisi commit saat di-archive, jadi updater tahu versi yang terpasang.

## Perubahan database
Tambahkan file baru `sql/migrations/NNN_nama.sql` (jangan ubah file lama) dan perbarui juga `sql/schema.sql` untuk instalasi baru.
Hindari nama kolom yang merupakan reserved word MariaDB.

## Development lokal
```bash
php -S localhost:8095 dev-router.php
```
