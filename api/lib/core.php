<?php

class ApiError extends Exception {}

function cfg(string $key, $default = null)
{
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/../config.php';
        $c = is_file($f) ? require $f : [];
    }
    return $c[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . cfg('db_host') . ';port=' . cfg('db_port', 3306) . ';dbname=' . cfg('db_name') . ';charset=utf8mb4',
            cfg('db_user'), cfg('db_pass'),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+07:00'");
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function rows(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function row(string $sql, array $params = []): ?array { return q($sql, $params)->fetch() ?: null; }
function val(string $sql, array $params = []) { $v = q($sql, $params)->fetchColumn(); return $v === false ? null : $v; }

function insert(string $table, array $data): int
{
    $cols = array_keys($data);
    q("INSERT INTO `$table` (`" . implode('`,`', $cols) . "`) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")", array_values($data));
    return (int)db()->lastInsertId();
}

function update(string $table, int $id, array $data): void
{
    if (!$data) return;
    $set = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($data)));
    q("UPDATE `$table` SET $set WHERE id = ?", [...array_values($data), $id]);
}

function fail(string $msg, int $code = 400): void { throw new ApiError($msg, $code); }

function body(): array
{
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $b = $raw ? (json_decode($raw, true) ?: []) : $_POST;
    }
    return $b;
}

function pick(array $src, array $keys): array
{
    $out = [];
    foreach ($keys as $k) {
        if (!array_key_exists($k, $src)) continue;
        $v = $src[$k];
        $out[$k] = is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v;
    }
    return $out;
}

function next_code(string $name, string $prefix): string
{
    $year = (int)date('Y');
    q("INSERT INTO sequences (name, year, last_no) VALUES (?, ?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)", [$name, $year]);
    return sprintf('%s-%d-%04d', $prefix, $year, (int)db()->lastInsertId());
}

function setting(string $k, $default = null)
{
    $v = val('SELECT v FROM settings WHERE k = ?', [$k]);
    return $v ?? $default;
}

function b64url_enc(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64url_dec(string $s): string { return base64_decode(strtr($s, '-_', '+/')) ?: ''; }

function jwt_sign(array $payload): string
{
    $h = b64url_enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = b64url_enc(json_encode($payload));
    return "$h.$p." . b64url_enc(hash_hmac('sha256', "$h.$p", cfg('jwt_secret'), true));
}

function jwt_verify(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    if (!hash_equals(b64url_enc(hash_hmac('sha256', "$h.$p", cfg('jwt_secret'), true)), $s)) return null;
    $data = json_decode(b64url_dec($p), true);
    if (!is_array($data) || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}

function bearer_token(): string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    }
    if (preg_match('/Bearer\s+(\S+)/i', $h, $m)) return $m[1];
    return $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
}

function auth(): array
{
    static $user = null;
    if ($user) return $user;
    $data = jwt_verify(bearer_token());
    if (!$data) fail('Sesi berakhir, silakan login ulang', 401);
    $user = row('SELECT id, nama, username, peran FROM users WHERE id = ? AND aktif = 1', [$data['uid']]);
    if (!$user) fail('Akun tidak aktif', 401);
    return $user;
}

function require_role(string ...$roles): array
{
    $u = auth();
    if ($u['peran'] !== 'admin' && !in_array($u['peran'], $roles, true)) fail('Anda tidak punya akses untuk aksi ini', 403);
    return $u;
}

function num($v): float
{
    return round((float)str_replace(',', '.', (string)$v), 2);
}

function tx(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
