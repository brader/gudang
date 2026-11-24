<?php
date_default_timezone_set('Asia/Jakarta');

$configFile = $ROOT . '/api/config.php';
$installed = is_file($configFile);
$error = '';
$done = false;

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

if (!$installed && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $f = fn($k) => trim((string)($_POST[$k] ?? ''));
    try {
        foreach (['db_host', 'db_name', 'db_user', 'admin_name', 'admin_username', 'admin_password'] as $k) {
            if ($f($k) === '') throw new Exception('Semua field wajib diisi (kecuali password DB jika memang kosong).');
        }
        if (!preg_match('/^[a-z0-9._-]{3,50}$/', strtolower($f('admin_username')))) throw new Exception('Username hanya boleh huruf, angka, titik, strip (3-50 karakter).');
        if (strlen($f('admin_password')) < 8) throw new Exception('Password admin minimal 8 karakter.');

        $pdo = new PDO(
            'mysql:host=' . $f('db_host') . ';port=' . ((int)$f('db_port') ?: 3306) . ';dbname=' . $f('db_name') . ';charset=utf8mb4',
            $f('db_user'), (string)($_POST['db_pass'] ?? ''),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );

        $sql = file_get_contents($ROOT . '/sql/schema.sql');
        foreach (array_filter(array_map('trim', preg_split('/;\s*\n/', $sql))) as $stmt) {
            $pdo->exec($stmt);
        }
        // schema.sql sudah versi terbaru, jadi semua file migrasi yang ada dianggap sudah dijalankan.
        foreach (glob($ROOT . '/sql/migrations/*.sql') ?: [] as $m) {
            $pdo->prepare('INSERT IGNORE INTO migrations (name) VALUES (?)')->execute([basename($m)]);
        }

        // Upsert agar installer aman diulang jika percobaan sebelumnya gagal di tengah jalan.
        $pdo->prepare("INSERT INTO users (nama, username, password_hash, peran, aktif) VALUES (?, ?, ?, 'admin', 1)
            ON DUPLICATE KEY UPDATE nama = VALUES(nama), password_hash = VALUES(password_hash), peran = 'admin', aktif = 1")
            ->execute([$f('admin_name'), strtolower($f('admin_username')), password_hash($f('admin_password'), PASSWORD_DEFAULT)]);
        if ($f('company_name') !== '') {
            $pdo->prepare("UPDATE settings SET v = ? WHERE k = 'company_name'")->execute([$f('company_name')]);
        }

        $config = [
            'db_host' => $f('db_host'),
            'db_port' => (int)$f('db_port') ?: 3306,
            'db_name' => $f('db_name'),
            'db_user' => $f('db_user'),
            'db_pass' => (string)($_POST['db_pass'] ?? ''),
            'jwt_secret' => bin2hex(random_bytes(32)),
        ];
        if (file_put_contents($configFile, "<?php\nreturn " . var_export($config, true) . ";\n") === false) {
            throw new Exception('Gagal menulis api/config.php — pastikan folder api/ bisa ditulis.');
        }
        @mkdir($ROOT . '/storage/backups', 0755, true);
        $done = true;
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
?><!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install RakStok</title>
<style>
:root{--primary:#1d4ed8;--border:#e2e8f0;--muted:#64748b}
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:24px 16px;color:#0f172a;font-size:14px}
.box{max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,.06)}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:22px 0 10px}
label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}input{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:7px;font-size:14px}
.row{display:flex;gap:10px}.row>div{flex:1}button,a.btn{display:inline-block;margin-top:22px;background:var(--primary);color:#fff;border:0;padding:11px 18px;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.err{background:#fef2f2;color:#b91c1c;padding:10px 12px;border-radius:7px;margin-top:14px}.ok{background:#f0fdf4;color:#166534;padding:12px;border-radius:7px;margin-top:14px}
p{color:var(--muted);margin:0}
</style></head><body><div class="box">
<h1>Install RakStok</h1>
<?php if ($done): ?>
  <div class="ok">Instalasi berhasil. Demi keamanan, <b>hapus file install.php</b> dari server.</div>
  <a class="btn" href="./">Buka Aplikasi →</a>
<?php elseif ($installed): ?>
  <p>Aplikasi sudah terinstall (file <code>api/config.php</code> sudah ada).</p>
  <p style="margin-top:10px">Kalau ini instalasi pertama di server ini atau aplikasi tidak bisa login, file itu kemungkinan
    sisa upload dari komputer lain. Hapus <code>api/config.php</code> lewat File Manager hosting, lalu muat ulang halaman ini.</p>
  <a class="btn" href="./">Buka Aplikasi →</a>
<?php else: ?>
  <p>Buat database &amp; user MySQL di panel hosting terlebih dahulu.</p>
  <?php if ($error): ?><div class="err"><?= h($error) ?></div><?php endif; ?>
  <form method="post">
    <h2>Database</h2>
    <div class="row"><div><label>Host</label><input name="db_host" value="<?= h($_POST['db_host'] ?? 'localhost') ?>"></div>
    <div style="max-width:110px"><label>Port</label><input name="db_port" value="<?= h($_POST['db_port'] ?? '3306') ?>"></div></div>
    <label>Nama Database</label><input name="db_name" value="<?= h($_POST['db_name'] ?? '') ?>">
    <div class="row"><div><label>User</label><input name="db_user" value="<?= h($_POST['db_user'] ?? '') ?>"></div>
    <div><label>Password</label><input type="password" name="db_pass"></div></div>
    <h2>Gudang &amp; Admin</h2>
    <label>Nama Gudang / Perusahaan</label><input name="company_name" value="<?= h($_POST['company_name'] ?? '') ?>">
    <label>Nama Admin</label><input name="admin_name" value="<?= h($_POST['admin_name'] ?? '') ?>">
    <label>Username Admin</label><input name="admin_username" autocapitalize="off" value="<?= h($_POST['admin_username'] ?? 'admin') ?>">
    <label>Password Admin (min 8 karakter)</label><input type="password" name="admin_password">
    <button type="submit">Install</button>
  </form>
<?php endif; ?>
</div></body></html>
