<?php
// Pro admin entry script: the web server sends here the /admin requests of the admin port only. It loads the code,
// reads the global Pro configuration and lets the admin API answer; an error gets 500 server_error as JSON.

declare(strict_types=1);

use Formgate\Intake\HttpRequest;
use Formgate\Pro\Admin\AdminApi;
use Formgate\Pro\Config\ProConfig;
use Formgate\Response\Response;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $response = (new AdminApi(ProConfig::fromEnvironment()))->handle($path, HttpRequest::fromGlobals());
} catch (Throwable $error) {
    error_log('formgate admin: ' . $error->getMessage());
    $response = Response::json(500, ['ok' => false, 'code' => 'server_error']);
}
$response->send();
