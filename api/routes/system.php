<?php

// Update aplikasi langsung dari repo GitHub (khusus admin).
// File yang tidak pernah ditimpa: config, installer, data upload/log, dan file khusus development.
const UPDATE_SKIP_FILES = ['api/config.php', 'install.php', 'dev-router.php', 'BLUEPRINT.md', 'README.md', '.gitignore', '.gitattributes'];
const UPDATE_SKIP_DIRS = ['storage/', 'tests/', '.git/', '.github/'];
const UPDATE_KEEP_BACKUPS = 3;

function app_root(): string { return dirname(__DIR__, 2); }

function update_settings(): array
{
    return [
        'repo' => setting('update_repo', 'brader/gudang'),
        'branch' => setting('update_branch', 'main'),
        'token' => (string)setting('github_token', ''),
    ];
}

function current_version(): array
{
    $f = app_root() . '/api/version.php';
    $v = is_file($f) ? (include $f) : [];
    $commit = is_array($v) && preg_match('/^[0-9a-f]{40}$/', (string)($v['commit'] ?? '')) ? $v['commit'] : '';
    $ver = trim((string)@file_get_contents(app_root() . '/VERSION'));
    return ['commit' => $commit, 'date' => $commit ? ($v['date'] ?? null) : null, 'version' => valid_ver($ver) ? $ver : ''];
}

function valid_ver(?string $v): bool { return (bool)preg_match('/^\d+(\.\d+){1,2}$/', (string)$v); }

// Ada update jika versi di GitHub lebih tinggi. Jika salah satu versi tidak diketahui, bandingkan commit.
function update_available(array $cur, array $latest): bool
{
    if (($latest['commit'] ?? '') === '' || $latest['commit'] === $cur['commit']) return false;
    if (valid_ver($cur['version'] ?? '') && valid_ver($latest['version'] ?? '')) return version_compare($latest['version'], $cur['version'], '>');
    return true;
}

function write_version(string $commit, ?string $date): void
{
    $php = "<?php\n// Diisi otomatis oleh git archive / updater. Jangan diedit manual.\nreturn " . var_export(['commit' => $commit, 'date' => $date], true) . ";\n";
    file_put_contents(app_root() . '/api/version.php', $php);
}

function github(string $path, bool $raw = false): array
{
    if (!function_exists('curl_init')) fail('Ekstensi PHP curl tidak aktif di server');
    $s = update_settings();
    $headers = ['User-Agent: RakStok-Updater', 'Accept: application/vnd.github+json'];
    if ($s['token'] !== '') $headers[] = 'Authorization: Bearer ' . $s['token'];
    $ch = curl_init(rtrim(cfg('update_api', 'https://api.github.com'), '/') . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $raw ? 180 : 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    if ($body === false) fail('Tidak bisa menghubungi GitHub: ' . $err);
    if ($code === 401 || $code === 403) fail('Akses GitHub ditolak — cek token GitHub di Pengaturan (repo private butuh token)');
    if ($code === 404) fail('Repo / branch tidak ditemukan di GitHub (atau token tidak punya akses ke repo ini)');
    if ($code >= 400) fail("GitHub membalas error $code");
    return $raw ? ['body' => $body] : (json_decode($body, true) ?: []);
}

function check_update(): array
{
    $s = update_settings();
    $cur = current_version();
    $latest = github("/repos/{$s['repo']}/commits/" . rawurlencode($s['branch']));
    $sha = $latest['sha'] ?? '';
    if (!preg_match('/^[0-9a-f]{40}$/', $sha)) fail('Balasan GitHub tidak dikenali');
    $ver = '';
    try {
        $vf = github("/repos/{$s['repo']}/contents/VERSION?ref=$sha");
        $ver = trim((string)base64_decode((string)($vf['content'] ?? '')));
    } catch (ApiError $e) {}
    $res = [
        'latest' => [
            'commit' => $sha,
            'version' => valid_ver($ver) ? $ver : '',
            'date' => $latest['commit']['committer']['date'] ?? null,
            'message' => strtok((string)($latest['commit']['message'] ?? ''), "\n"),
        ],
        'available' => false,
        'behind' => null,
        'changes' => [],
        'checked_at' => date('Y-m-d H:i:s'),
    ];
    $res['available'] = update_available($cur, $res['latest']);
    if ($res['available'] && $cur['commit']) {
        $cmp = github("/repos/{$s['repo']}/compare/{$cur['commit']}...$sha");
        $res['behind'] = (int)($cmp['ahead_by'] ?? 0);
        foreach (array_reverse(array_slice($cmp['commits'] ?? [], -30)) as $c) {
            $res['changes'][] = [
                'commit' => substr($c['sha'] ?? '', 0, 7),
                'date' => $c['commit']['author']['date'] ?? null,
                'message' => strtok((string)($c['commit']['message'] ?? ''), "\n"),
            ];
        }
    }
    q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['update_check', json_encode($res)]);
    return $res;
}

function update_skipped(string $rel): bool
{
    if (in_array($rel, UPDATE_SKIP_FILES, true)) return true;
    foreach (UPDATE_SKIP_DIRS as $d) if (str_starts_with($rel, $d)) return true;
    return false;
}

function backup_dir(): string
{
    $d = app_root() . '/storage/backups';
    if (!is_dir($d) && !mkdir($d, 0755, true)) fail('Folder storage/backups tidak bisa dibuat', 500);
    return $d;
}

function list_backups(): array
{
    $out = [];
    foreach (glob(backup_dir() . '/backup-*.zip') ?: [] as $f) {
        $out[] = ['file' => basename($f), 'size' => filesize($f), 'created_at' => date('Y-m-d H:i:s', filemtime($f))];
    }
    usort($out, fn($a, $b) => strcmp($b['file'], $a['file']));
    return $out;
}

// Tulis semua file ke *.upd-tmp dulu; baru di-rename setelah semuanya berhasil ditulis.
function write_files(array $contents): void
{
    $root = app_root();
    $tmps = [];
    foreach ($contents as $rel => $data) {
        $dest = "$root/$rel";
        if (!is_dir(dirname($dest)) && !mkdir(dirname($dest), 0755, true)) {
            foreach ($tmps as $t) @unlink($t);
            fail("Folder untuk $rel tidak bisa dibuat", 500);
        }
        if (file_put_contents("$dest.upd-tmp", $data) === false) {
            foreach ($tmps as $t) @unlink($t);
            fail("File $rel tidak bisa ditulis — cek permission folder di hosting", 500);
        }
        $tmps[$dest] = "$dest.upd-tmp";
    }
    foreach ($tmps as $dest => $tmp) {
        if (!rename($tmp, $dest)) fail("Gagal memasang $dest", 500);
    }
}

function run_migrations(): array
{
    q('CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)
        ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $done = array_column(rows('SELECT name FROM migrations'), 'name');
    $files = glob(app_root() . '/sql/migrations/*.sql') ?: [];
    sort($files);
    $ran = [];
    foreach ($files as $f) {
        $name = basename($f);
        if (in_array($name, $done, true)) continue;
        foreach (array_filter(array_map('trim', preg_split('/;\s*\n/', (string)file_get_contents($f)))) as $stmt) {
            db()->exec($stmt);
        }
        q('INSERT INTO migrations (name) VALUES (?)', [$name]);
        $ran[] = $name;
    }
    return $ran;
}

function reset_opcache(): void
{
    if (function_exists('opcache_reset')) @opcache_reset();
}

function apply_update(string $sha): array
{
    if (!preg_match('/^[0-9a-f]{40}$/', $sha)) fail('Versi update tidak valid');
    if (!class_exists('ZipArchive')) fail('Ekstensi PHP zip tidak aktif di server');
    @set_time_limit(300);
    $s = update_settings();
    $root = app_root();
    $cur = current_version();

    $zipPath = backup_dir() . "/download-$sha.zip";
    file_put_contents($zipPath, github("/repos/{$s['repo']}/zipball/$sha", true)['body']);
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) { @unlink($zipPath); fail('File update rusak, coba lagi'); }

    $contents = [];
    $prefix = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        $prefix ??= substr($name, 0, strpos($name, '/') + 1);
        if (!str_starts_with($name, $prefix)) continue;
        $rel = substr($name, strlen($prefix));
        if ($rel === '' || str_ends_with($rel, '/')) continue;
        if (str_contains($rel, '..') || str_starts_with($rel, '/') || str_contains($rel, '\\')) {
            $zip->close(); @unlink($zipPath); fail('Isi paket update tidak valid');
        }
        if (update_skipped($rel)) continue;
        $data = $zip->getFromIndex($i);
        if ($data === false) { $zip->close(); @unlink($zipPath); fail("Gagal membaca $rel dari paket update"); }
        $contents[$rel] = $data;
    }
    $zip->close();
    @unlink($zipPath);
    if (!isset($contents['api/index.php'], $contents['index.html'])) fail('Paket update tidak lengkap');

    $backupName = 'backup-' . date('Ymd-His') . '-' . ($cur['commit'] ? substr($cur['commit'], 0, 7) : 'awal') . '.zip';
    $bk = new ZipArchive();
    if ($bk->open(backup_dir() . "/$backupName", ZipArchive::CREATE) !== true) fail('Backup tidak bisa dibuat', 500);
    $added = [];
    foreach (array_keys($contents) as $rel) {
        if (is_file("$root/$rel")) $bk->addFile("$root/$rel", $rel);
        else $added[] = $rel;
    }
    if (is_file("$root/api/version.php")) $bk->addFile("$root/api/version.php", 'api/version.php');
    $bk->addFromString('backup-info.json', json_encode(['from' => $cur, 'to' => $sha, 'added' => $added, 'created_at' => date('c')]));
    $bk->close();

    write_files($contents);
    $latest = json_decode((string)setting('update_check', '{}'), true)['latest'] ?? [];
    write_version($sha, ($latest['commit'] ?? '') === $sha ? ($latest['date'] ?? null) : null);
    reset_opcache();
    $migrations = run_migrations();

    $backups = list_backups();
    foreach (array_slice($backups, UPDATE_KEEP_BACKUPS) as $old) @unlink(backup_dir() . '/' . $old['file']);
    q("DELETE FROM settings WHERE k = 'update_check'");
    return ['ok' => true, 'commit' => $sha, 'version' => current_version()['version'], 'files' => count($contents), 'migrations' => $migrations, 'backup' => $backupName];
}

route('GET', '/system/update', function () {
    require_role();
    $s = update_settings();
    return [
        'current' => current_version(),
        'repo' => $s['repo'],
        'branch' => $s['branch'],
        'has_token' => $s['token'] !== '',
        'last_check' => json_decode((string)setting('update_check', 'null'), true),
        'backups' => list_backups(),
        'requirements' => [
            'curl' => function_exists('curl_init'),
            'zip' => class_exists('ZipArchive'),
            'writable' => is_writable(app_root()) && is_writable(app_root() . '/api') && is_writable(app_root() . '/js'),
        ],
    ];
});

// Dipanggil saat admin membuka aplikasi: pakai hasil cek terakhir, cek ulang ke GitHub paling sering tiap 6 jam.
route('GET', '/system/update/status', function () {
    require_role();
    $last = json_decode((string)setting('update_check', 'null'), true);
    if (!$last || strtotime($last['checked_at'] ?? '2000-01-01') < time() - 6 * 3600) {
        try { $last = check_update(); } catch (Throwable $e) { return ['available' => false]; }
    }
    $available = update_available(current_version(), $last['latest'] ?? []);
    return ['available' => $available, 'version' => $last['latest']['version'] ?? '', 'behind' => $last['behind'] ?? null];
});

route('POST', '/system/update/check', function () {
    require_role();
    return check_update();
});

route('POST', '/system/update/apply', function () {
    require_role();
    return apply_update((string)(body()['commit'] ?? ''));
});

route('POST', '/system/update/rollback', function () {
    require_role();
    if (!class_exists('ZipArchive')) fail('Ekstensi PHP zip tidak aktif di server');
    $file = (string)(body()['file'] ?? '');
    $backups = array_column(list_backups(), 'file');
    if (!in_array($file, $backups, true)) fail('Backup tidak ditemukan');
    $zip = new ZipArchive();
    if ($zip->open(backup_dir() . "/$file") !== true) fail('File backup rusak');
    $contents = [];
    $info = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $rel = $zip->getNameIndex($i);
        if ($rel === 'backup-info.json') { $info = json_decode((string)$zip->getFromIndex($i), true); continue; }
        if (str_contains($rel, '..') || str_starts_with($rel, '/') || update_skipped($rel)) continue;
        $contents[$rel] = $zip->getFromIndex($i);
    }
    $zip->close();
    write_files($contents);
    // File yang baru ditambahkan oleh update tersebut ikut dihapus agar kembali persis seperti sebelumnya.
    foreach ($info['added'] ?? [] as $rel) {
        if (is_string($rel) && !str_contains($rel, '..') && !update_skipped($rel) && $rel !== 'api/version.php') @unlink(app_root() . "/$rel");
    }
    if (!isset($contents['api/version.php'])) {
        $from = $info['from']['commit'] ?? '';
        $from ? write_version($from, $info['from']['date'] ?? null) : @unlink(app_root() . '/api/version.php');
    }
    reset_opcache();
    q("DELETE FROM settings WHERE k = 'update_check'");
    return ['ok' => true, 'files' => count($contents)];
});

route('PUT', '/system/update/settings', function () {
    require_role();
    $b = body();
    $save = [];
    if (isset($b['repo'])) {
        $repo = trim((string)$b['repo']);
        if (!preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $repo)) fail('Format repo harus pemilik/nama-repo');
        $save['update_repo'] = $repo;
    }
    if (isset($b['branch'])) {
        $branch = trim((string)$b['branch']);
        if (!preg_match('#^[A-Za-z0-9_./-]+$#', $branch)) fail('Nama branch tidak valid');
        $save['update_branch'] = $branch;
    }
    if (!empty($b['clear_token'])) $save['github_token'] = '';
    elseif (isset($b['token']) && trim((string)$b['token']) !== '') $save['github_token'] = trim((string)$b['token']);
    foreach ($save as $k => $v) q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, $v]);
    q("DELETE FROM settings WHERE k = 'update_check'");
    return ['ok' => true];
});
