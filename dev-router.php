<?php
// Hanya untuk development lokal: php -S localhost:8080 dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) { require __DIR__ . '/api/index.php'; return true; }
if (preg_match('#^/(storage|sql)/#', $path) || preg_match('#\.(sql|md)$#', $path)) { http_response_code(403); return true; }
return false;
