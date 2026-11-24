<?php
date_default_timezone_set('Asia/Jakarta');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
// Peringatan PHP tidak boleh ikut tercetak karena merusak JSON; tetap tercatat di log server.
ini_set('display_errors', '0');

if (version_compare(PHP_VERSION, '8.1.0', '<')) {
    http_response_code(500);
    echo json_encode(['error' => 'Server memakai PHP ' . PHP_VERSION . '. Ubah ke PHP 8.1 atau lebih baru di pengaturan hosting.']);
    exit;
}

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/stok.php';

$ROUTES = [];
function route(string $method, string $pattern, callable $handler): void
{
    global $ROUTES;
    $re = '#^' . preg_replace('#:(\w+)#', '(?P<$1>[^/]+)', $pattern) . '$#';
    $ROUTES[] = [$method, $re, $handler];
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}

try {
    if (!is_file(__DIR__ . '/config.php')) fail('Aplikasi belum diinstall. Buka install.php', 503);

    foreach (glob(__DIR__ . '/routes/*.php') as $f) require $f;

    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
    $pos = strpos($uri, '/api/');
    $path = '/' . trim($pos === false ? '' : substr($uri, $pos + 5), '/');
    $method = $_SERVER['REQUEST_METHOD'];

    foreach ($ROUTES as [$m, $re, $handler]) {
        if ($m === $method && preg_match($re, $path, $mt)) {
            $params = array_filter($mt, 'is_string', ARRAY_FILTER_USE_KEY);
            $result = $handler($params);
            if ($result !== null) json_out($result);
            exit;
        }
    }
    fail('Endpoint tidak ditemukan', 404);
} catch (ApiError $e) {
    json_out(['error' => $e->getMessage()], $e->getCode() ?: 400);
} catch (PDOException $e) {
    $ref = log_error($e);
    $msg = $e->getCode() === '23000' ? 'Data duplikat atau masih dipakai data lain' : "Terjadi kesalahan database (kode $ref)";
    json_out(['error' => $msg], 500);
} catch (Throwable $e) {
    $ref = log_error($e);
    json_out(['error' => "Terjadi kesalahan server (kode $ref)"], 500);
}

// Dicatat juga ke storage/error.log (tertutup dari web) agar mudah dicek lewat File Manager hosting.
function log_error(Throwable $e): string
{
    $ref = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
    $line = sprintf("[%s] %s %s %s: %s @ %s:%d\n", date('Y-m-d H:i:s'), $ref, $_SERVER['REQUEST_METHOD'] ?? '-',
        $_SERVER['REQUEST_URI'] ?? '-', $e->getMessage(), basename($e->getFile()), $e->getLine());
    error_log('[RakStok] ' . trim($line));
    @file_put_contents(dirname(__DIR__) . '/storage/error.log', $line, FILE_APPEND | LOCK_EX);
    return $ref;
}
