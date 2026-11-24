CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (k, v) VALUES ('company_name', 'RakStok');

CREATE TABLE IF NOT EXISTS migrations (
  name VARCHAR(190) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sequences (
  name VARCHAR(32) NOT NULL,
  year SMALLINT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (name, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  peran VARCHAR(20) NOT NULL DEFAULT 'staf',
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gudang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  awalan VARCHAR(10) NOT NULL DEFAULT '',
  alamat VARCHAR(255) NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_awalan (awalan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gudang (id, nama, awalan) VALUES (1, 'Gudang Utama', '');

CREATE TABLE IF NOT EXISTS lokasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gudang_id INT NOT NULL DEFAULT 1,
  kode VARCHAR(30) NOT NULL UNIQUE,
  rak VARCHAR(10) NOT NULL,
  tingkat SMALLINT NOT NULL DEFAULT 1,
  slot SMALLINT NOT NULL DEFAULT 1,
  keterangan VARCHAR(255) NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_rak (rak),
  KEY idx_gudang (gudang_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS barang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  nama VARCHAR(150) NOT NULL,
  kategori VARCHAR(60) NULL,
  satuan VARCHAR(20) NOT NULL DEFAULT 'pcs',
  stok_min DECIMAL(14,2) NOT NULL DEFAULT 0,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stok (
  id INT AUTO_INCREMENT PRIMARY KEY,
  barang_id INT NOT NULL,
  lokasi_id INT NOT NULL,
  qty DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_barang_lokasi (barang_id, lokasi_id),
  KEY idx_lokasi (lokasi_id),
  CONSTRAINT fk_stok_barang FOREIGN KEY (barang_id) REFERENCES barang(id),
  CONSTRAINT fk_stok_lokasi FOREIGN KEY (lokasi_id) REFERENCES lokasi(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mutasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  jenis VARCHAR(10) NOT NULL,
  barang_id INT NOT NULL,
  lokasi_asal_id INT NULL,
  lokasi_tujuan_id INT NULL,
  qty DECIMAL(14,2) NOT NULL,
  referensi VARCHAR(100) NULL,
  catatan VARCHAR(255) NULL,
  opname_id INT NULL,
  user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tanggal (tanggal),
  KEY idx_barang (barang_id),
  KEY idx_asal (lokasi_asal_id),
  KEY idx_tujuan (lokasi_tujuan_id),
  CONSTRAINT fk_mutasi_barang FOREIGN KEY (barang_id) REFERENCES barang(id),
  CONSTRAINT fk_mutasi_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opname (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kode VARCHAR(30) NOT NULL UNIQUE,
  gudang_id INT NOT NULL DEFAULT 1,
  tanggal DATE NOT NULL,
  cakupan VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(10) NOT NULL DEFAULT 'hitung',
  catatan VARCHAR(255) NULL,
  dibuat_oleh INT NOT NULL,
  diselesaikan_oleh INT NULL,
  selesai_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opname_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  opname_id INT NOT NULL,
  barang_id INT NOT NULL,
  lokasi_id INT NOT NULL,
  qty_sistem DECIMAL(14,2) NOT NULL DEFAULT 0,
  qty_fisik DECIMAL(14,2) NULL,
  dihitung_oleh INT NULL,
  dihitung_at DATETIME NULL,
  UNIQUE KEY uq_item (opname_id, barang_id, lokasi_id),
  CONSTRAINT fk_oi_opname FOREIGN KEY (opname_id) REFERENCES opname(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_barang FOREIGN KEY (barang_id) REFERENCES barang(id),
  CONSTRAINT fk_oi_lokasi FOREIGN KEY (lokasi_id) REFERENCES lokasi(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
