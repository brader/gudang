<?php

route('POST', '/auth/login', function () {
    $b = body();
    $username = strtolower(trim((string)($b['username'] ?? '')));
    $u = row('SELECT * FROM users WHERE username = ? AND aktif = 1', [$username]);
    if (!$u || !password_verify((string)($b['password'] ?? ''), $u['password_hash'])) {
        usleep(400000);
        fail('Username atau password salah', 401);
    }
    $token = jwt_sign(['uid' => (int)$u['id'], 'exp' => time() + 14 * 86400]);
    return ['token' => $token, 'user' => auth_user((int)$u['id'])];
});

function auth_user(int $id): array
{
    return row('SELECT id, nama, username, peran FROM users WHERE id = ?', [$id]);
}

route('GET', '/me', fn() => auth_user((int)auth()['id']));

route('PUT', '/me/password', function () {
    $u = auth();
    $b = body();
    $hash = val('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
    if (!password_verify((string)($b['old_password'] ?? ''), $hash)) fail('Password lama salah');
    if (strlen((string)($b['new_password'] ?? '')) < 6) fail('Password baru minimal 6 karakter');
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($b['new_password'], PASSWORD_DEFAULT), $u['id']]);
    return ['ok' => true];
});

route('GET', '/meta', function () {
    auth();
    return [
        'company_name' => setting('company_name', 'RakStok'),
        'version' => substr(current_version()['commit'], 0, 7),
        'peran' => PERAN,
        'kategori' => array_column(rows('SELECT DISTINCT kategori FROM barang WHERE kategori IS NOT NULL ORDER BY kategori'), 'kategori'),
        'satuan' => array_values(array_unique(array_merge(['pcs', 'box', 'karton', 'kg', 'liter', 'roll'],
            array_column(rows('SELECT DISTINCT satuan FROM barang ORDER BY satuan'), 'satuan')))),
        'rak' => array_column(rows('SELECT DISTINCT rak FROM lokasi WHERE aktif = 1 ORDER BY rak'), 'rak'),
    ];
});

route('GET', '/settings', function () {
    require_role();
    return ['company_name' => setting('company_name', 'RakStok')];
});

route('PUT', '/settings', function () {
    require_role();
    $name = trim((string)(body()['company_name'] ?? ''));
    if ($name === '') fail('Nama wajib diisi');
    q('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['company_name', $name]);
    return ['ok' => true];
});

// ─── User ────────────────────────────────────────────────
route('GET', '/users', function () {
    require_role();
    return rows('SELECT id, nama, username, peran, aktif, created_at FROM users ORDER BY aktif DESC, nama');
});

function simpan_user(?int $id): array
{
    $me = require_role();
    $b = body();
    $d = [
        'nama' => trim((string)($b['nama'] ?? '')),
        'username' => strtolower(trim((string)($b['username'] ?? ''))),
        'peran' => (string)($b['peran'] ?? 'staf'),
        'aktif' => !empty($b['aktif']) ? 1 : 0,
    ];
    if ($d['nama'] === '') fail('Nama wajib diisi');
    if (!preg_match('/^[a-z0-9._-]{3,50}$/', $d['username'])) fail('Username hanya huruf kecil, angka, titik, strip (3-50 karakter)');
    if (!isset(PERAN[$d['peran']])) fail('Peran tidak valid');
    if (val('SELECT id FROM users WHERE username = ? AND id <> ?', [$d['username'], $id ?? 0])) fail('Username sudah dipakai');
    if ($id && $id === (int)$me['id'] && ($d['peran'] !== 'admin' || !$d['aktif'])) fail('Tidak bisa menurunkan peran / menonaktifkan akun sendiri');
    $pw = (string)($b['password'] ?? '');
    if ($pw !== '') {
        if (strlen($pw) < 6) fail('Password minimal 6 karakter');
        $d['password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
    } elseif (!$id) fail('Password wajib diisi untuk user baru');
    if ($id) update('users', $id, $d); else $id = insert('users', $d);
    return ['id' => $id];
}

route('POST', '/users', fn() => simpan_user(null));
route('PUT', '/users/:id', fn($a) => simpan_user((int)$a['id']));
