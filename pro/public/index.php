<?php
// Pro entry script: the web server sends every request here. It loads the code, reads the global Pro
// configuration and lets the gateway answer; an error before the kernel runs gets 500 server_error.

declare(strict_types=1);

use Formgate\Intake\HttpRequest;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Http\Gateway;
use Formgate\Response\ErrorCode;
use Formgate\Response\Response;

require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $response = (new Gateway(ProConfig::fromEnvironment()))->handle($path, HttpRequest::fromGlobals());
} catch (Throwable $error) {
    error_log('formgate: ' . $error->getMessage());
    $response = Response::failure(ErrorCode::ServerError);
}
$response->send();
