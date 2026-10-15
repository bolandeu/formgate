<?php
// Lite entry script: a site form posts here. It loads the code, reads the settings and wires the modules
// (storage, time tokens signed by the key in the storage place, spam filter, delivery at once with alerts,
// self-check) into the kernel, which handles the request and gives the answer. The Lite project of a time token is
// its list of domains.

declare(strict_types=1);

use Formgate\Alerts\AlerterFactory;
use Formgate\Delivery\Dispatcher;
use Formgate\Delivery\ImmediateDelivery;
use Formgate\Intake\HttpRequest;
use Formgate\Kernel;
use Formgate\Response\ErrorCode;
use Formgate\Response\Response;
use Formgate\SelfCheck\SelfCheckFactory;
use Formgate\Settings\Settings;
use Formgate\Spam\SpamFilterFactory;
use Formgate\Storage\StorageFactory;
use Formgate\Storage\StoragePlace;
use Formgate\Storage\UnconfiguredRequests;
use Formgate\Token\StoredSigningKey;
use Formgate\Token\TimeTokens;

require __DIR__ . '/vendor/autoload.php';

spl_autoload_register(static function (string $class): void {
    $prefix = 'Formgate\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

$http = HttpRequest::fromGlobals();
try {
    $settings = Settings::load();
} catch (Throwable $error) {
    error_log('formgate: ' . $error->getMessage());
    UnconfiguredRequests::keep($http);
    Response::failure(ErrorCode::ServerError)->send();
    return;
}

$storage = StorageFactory::create($settings);
$signingKey = new StoredSigningKey(StoragePlace::find());
$timeTokens = new TimeTokens($signingKey, implode(' ', $settings->domains()), $settings, $storage);
$kernel = new Kernel(
    $settings,
    $storage,
    SpamFilterFactory::create($settings, $storage, $timeTokens),
    new ImmediateDelivery(new Dispatcher($settings), $storage, AlerterFactory::create($settings)),
    SelfCheckFactory::create($settings, $storage, $signingKey),
    $timeTokens,
);
$kernel->handle($http)->send();
