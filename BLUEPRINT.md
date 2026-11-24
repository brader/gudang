# Blueprint — Aplikasi Gudang Sederhana (nama kerja: **RakStok**)

## 1. Tujuan
- Tahu **barang apa ada di rak mana, berapa jumlahnya** setiap saat.
- Semua perubahan stok tercatat (masuk / keluar / pindah rak / koreksi).
- Stok opname per rak lebih cepat: sistem menyiapkan daftar, staf tinggal isi jumlah fisik, selisih otomatis jadi koreksi.

## 2. Stack & Deploy (mengikuti pola SampleHub)
| Bagian | Pilihan |
|---|---|
| Backend | PHP 8.1+ native (tanpa framework), PDO |
| Database | MySQL/MariaDB bawaan cPanel |
| Frontend | Vanilla HTML/CSS/JS, SPA `index.html` + JS per modul |
| Auth | Login session PHP (cookie), 2 role: `admin`, `staf` |
| Label | QR code dibuat di browser (lib `qrcode.js`), dicetak dari halaman print |
| Install | Upload zip → buat DB di cPanel → buka `install.php` (buat tabel + akun admin, lalu terkunci) |

Catatan hosting: tanpa `strict_types`, bandingkan id sebagai string di JS, hindari reserved word MariaDB pada nama kolom.

## 3. Konsep Penandaan Rak
Kode lokasi format **`RAK-TINGKAT-SLOT`**, contoh `A-02-05` = Rak A, tingkat 2, slot 5.
- Admin bisa buat rak sekaligus: "Rak A, 4 tingkat, 6 slot" → otomatis 24 lokasi.
- Tiap lokasi punya **label QR** (isi = kode lokasi) untuk ditempel di rak.
- Tiap barang juga bisa dicetak label QR (isi = SKU).
- Scanner barcode USB/Bluetooth bekerja seperti keyboard → cukup fokus ke kolom input lalu scan.

## 4. Skema Database (6 tabel)
```
users        id, nama, username, password_hash, role(admin|staf), aktif, created_at

lokasi       id, kode (unik, mis. A-02-05), rak, tingkat, slot, keterangan, aktif

barang       id, sku (unik), nama, kategori, satuan, stok_min, aktif, created_at

stok         id, barang_id, lokasi_id, qty            -- UNIQUE(barang_id, lokasi_id)
             (saldo cepat; selalu diubah bersamaan dengan insert ke mutasi dalam 1 transaksi)

mutasi       id, tanggal, jenis(masuk|keluar|pindah|koreksi),
             barang_id, lokasi_asal_id NULL, lokasi_tujuan_id NULL, qty,
             referensi (no. PO / SJ / opname), catatan, user_id, created_at
             -- buku besar stok, tidak pernah dihapus/diedit

opname       id, kode, tanggal, cakupan (semua | daftar rak), status(draft|hitung|selesai),
             catatan, dibuat_oleh, diselesaikan_oleh, selesai_at
opname_item  id, opname_id, barang_id, lokasi_id, qty_sistem, qty_fisik NULL, selisih
```
Aturan: stok tidak boleh minus; mutasi yang salah dibetulkan dengan mutasi koreksi, bukan dihapus.

## 5. Alur Utama
**Barang masuk** — pilih/scan barang → scan lokasi rak → qty → simpan (`mutasi masuk`, stok +).

**Barang keluar** — scan barang → sistem tampilkan rak yang ada stoknya → pilih rak → qty (`mutasi keluar`, stok −).

**Pindah rak** — scan barang → rak asal → rak tujuan → qty (`mutasi pindah`).

**Stok opname**
1. Admin buat sesi opname, pilih cakupan (semua / rak A, B…). Sistem **snapshot** `qty_sistem` ke `opname_item`.
2. Status `hitung`: staf buka di HP, scan label rak → muncul daftar barang di rak itu → isi qty fisik. Barang tak terdaftar di rak itu bisa ditambah (qty_sistem = 0).
3. Admin review selisih → **Selesaikan** → sistem buat `mutasi koreksi` untuk tiap selisih ≠ 0, sesi terkunci.
4. Selama opname berjalan, transaksi di rak yang sedang diopname diberi peringatan (bukan diblokir).

## 6. Halaman
| Halaman | Isi |
|---|---|
| Dashboard | Total SKU, stok di bawah minimum, mutasi hari ini, opname aktif |
| Barang | Daftar + cari, tambah/edit, detail: stok per rak + riwayat mutasi, cetak label |
| Rak / Lokasi | Generate rak, daftar lokasi, isi per lokasi, cetak label QR massal |
| Transaksi | Form cepat Masuk / Keluar / Pindah (ramah HP, fokus scan) |
| Stok | Tabel stok per barang atau per rak, filter, export CSV |
| Riwayat | Log mutasi dengan filter tanggal/jenis/barang/rak, export CSV |
| Opname | Daftar sesi, layar hitung per rak, laporan selisih, cetak hasil |
| User (admin) | Kelola akun & role |

Hak akses: **staf** = transaksi, hitung opname, lihat stok. **admin** = semua + master data, buka/selesaikan opname, user.

## 7. Struktur Folder
```
gudang/
├── index.html            SPA
├── login.html
├── install.php           sekali jalan, lalu buat file storage/installed.lock
├── assets/
│   ├── app.js            api(), toast(), escHtml(), navigate()
│   ├── barang.js  lokasi.js  transaksi.js  stok.js  opname.js  user.js
│   └── vendor/qrcode.min.js
├── api/
│   ├── config.sample.php → config.php (kredensial DB, tidak ikut repo)
│   ├── lib/core.php      PDO, session, json response, cek role, log error
│   ├── auth.php  barang.php  lokasi.php  stok.php  mutasi.php  opname.php  user.php
├── sql/schema.sql
└── storage/              error.log, installed.lock (dilindungi .htaccess)
```

## 8. Tahapan Pengerjaan
1. **Fondasi** — schema, install.php, login, layout SPA.
2. **Master data** — barang, generate rak/lokasi, cetak label QR.
3. **Transaksi** — masuk, keluar, pindah + riwayat mutasi + tampilan stok.
4. **Opname** — sesi, layar hitung per rak, finalisasi koreksi.
5. **Dashboard & export CSV**, uji di HP, paket zip untuk upload cPanel.

## 9. Ditunda (versi berikutnya)
- Batch / tanggal kedaluwarsa (FEFO) — penting untuk kosmetik, tapi menambah kompleksitas
- Scan QR pakai kamera HP (sementara pakai scanner atau ketik kode)
- Multi gudang
- Import barang dari Excel
- Dokumen PO / surat jalan, tanda tangan
- Kapasitas rak, saran lokasi penyimpanan

## 10. Perlu Dikonfirmasi
1. Perlu **batch & ED** sejak awal? (bahan baku/produk kosmetik biasanya perlu)
2. Satu gudang saja, atau ada beberapa gudang/ruang?
3. Kira-kira jumlah SKU dan rak?
4. Ada scanner barcode, atau mau scan via kamera HP?
5. Format kode rak `A-02-05` cocok, atau sudah ada penamaan sendiri?
