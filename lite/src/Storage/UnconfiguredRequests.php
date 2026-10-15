<?php
// When the settings file is missing or invalid, the visitor still gets a request through: this keeps its fields in
// the storage with the status failed and the default route, so the operator loses nothing. The storage and the intake limits come from the
// defaults alone. A failure to keep the request goes to error_log and never reaches the visitor.

declare(strict_types=1);

namespace Formgate\Storage;

use Formgate\Channels\DeliveryReport;
use Formgate\Intake\HttpRequest;
use Formgate\Intake\Intake;
use Formgate\Routing\Route;
use Formgate\Settings\Settings;
use Throwable;

final class UnconfiguredRequests
{
    public static function keep(HttpRequest $http): void
    {
        if ($http->method !== 'POST') {
            return;
        }
        try {
            $settings = Settings::defaults();
            $request = (new Intake($settings))->parse($http);
            StorageFactory::create($settings)->saveRequest($request, new Route(null, []), new DeliveryReport());
        } catch (Throwable $error) {
            error_log('formgate: the request is not stored: ' . $error->getMessage());
        }
    }
}
