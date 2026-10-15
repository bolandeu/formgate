<?php
// The shape of stored records, the same in every storage: a request with its status, channel results and route
// (Route::name(); a request stored before routing has none and took the default route), a spam
// log entry with its reason and the service field values (ServiceFields::values()), so a spam log entry can be
// delivered later as the visitor sent it. Times are UTC in ISO 8601, so a text comparison orders them.

declare(strict_types=1);

namespace Formgate\Storage;

use DateTimeImmutable;
use DateTimeZone;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Routing\Route;
use Formgate\Spam\SpamReason;

final class Records
{
    /** @return array<string, mixed> */
    public static function request(Request $request, Route $route, DeliveryReport $report): array
    {
        return self::source($request)
            + ['status' => $report->status()->value, 'channels' => $report->results(), 'route' => $route->name()];
    }

    /** @return array<string, mixed> */
    public static function spam(Request $request, SpamReason $reason): array
    {
        return self::source($request) + ['service' => $request->service->values(), 'reason' => $reason->value];
    }

    public static function time(DateTimeImmutable $at): string
    {
        return $at->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    public static function json(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private static function source(Request $request): array
    {
        return [
            'received_at' => self::time($request->receivedAt),
            'form' => $request->service->form,
            'fields' => $request->fields,
        ] + $request->server->values();
    }
}
