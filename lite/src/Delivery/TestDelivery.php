<?php
// The test delivery: in place of the channels it appends the request as one JSON line to a file: the time (ISO 8601),
// the form, the fields, the service values, the consent line and the channels of the route (number, type, name). The
// request is stored as delivered. A file that cannot be written gives delivery_failed, as a failed channel does.

declare(strict_types=1);

namespace Formgate\Delivery;

use Formgate\Channels\DeliveryReport;
use Formgate\Channels\ChannelResult;
use Formgate\Intake\Request;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;
use Formgate\Routing\Route;
use Formgate\Routing\Router;
use Formgate\Settings\Settings;
use Formgate\Storage\Storage;

final class TestDelivery implements Delivery
{
    public function __construct(
        private readonly string $file,
        private readonly Settings $settings,
        private readonly Storage $storage,
    ) {
    }

    public function deliver(Request $request, Route $route): void
    {
        $line = json_encode($this->entry($request, $route), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (@file_put_contents($this->file, $line . "\n", FILE_APPEND | LOCK_EX) === false) {
            error_log("formgate: test delivery cannot write {$this->file}");
            throw new Rejection(ErrorCode::DeliveryFailed);
        }
        $report = new DeliveryReport();
        foreach ($this->channels($route) as $channel) {
            $report->add($channel['label'], ChannelResult::delivered());
        }
        $this->storage->saveRequest($request, $route, $report);
    }

    /** @return array<string, mixed> */
    private function entry(Request $request, Route $route): array
    {
        return [
            'time' => $request->receivedAt->format(DATE_ATOM),
            'form' => $request->service->form,
            'fields' => $request->fields,
            'service' => [
                'subject' => $request->service->subject,
                'reply_to' => $request->service->replyTo,
                'redirect' => $request->service->redirect,
            ],
            'consent' => $request->consentLine(),
            'channels' => array_map(
                fn (array $channel): array => array_diff_key($channel, ['label' => true]),
                $this->channels($route),
            ),
        ];
    }

    /** @return list<array{number: int, type: string, name: string|null, label: string}> the channels the route chose */
    private function channels(Route $route): array
    {
        $chosen = [];
        foreach ($this->settings->channels() as $index => $channel) {
            if ($route->hasChannel($index)) {
                $chosen[] = [
                    'number' => $index + 1,
                    'type' => $channel['type'],
                    'name' => $channel['name'],
                    'label' => Router::channelName($channel['type'], $index),
                ];
            }
        }
        return $chosen;
    }
}
