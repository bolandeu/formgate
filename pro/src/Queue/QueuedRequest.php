<?php
// A request in the Pro queue as the worker takes it: its id, the project key, what is needed to make the Lite
// request again (fields, service field values, the time it came), how many delivery attempts it had and the result
// of each channel so far, and the route it took (Route::name()).

declare(strict_types=1);

namespace Formgate\Pro\Queue;

use DateTimeImmutable;
use DateTimeZone;
use Formgate\Channels\ChannelResult;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Intake\ServiceFields;

final class QueuedRequest
{
    /**
     * @param array<string, string> $fields
     * @param array<string, string> $serviceValues the values of ServiceFields::values()
     * @param array<string, array{delivered: bool, reason: string}> $channelResults channel name => its last result
     */
    public function __construct(
        public readonly int $id,
        public readonly string $projectKey,
        private readonly array $fields,
        private readonly array $serviceValues,
        public readonly string $receivedAt,
        public readonly int $attempts,
        private readonly array $channelResults,
        public readonly string $route,
    ) {
    }

    /** The request as the intake made it, its time in the time zone of the project. */
    public function request(DateTimeZone $timezone): Request
    {
        return new Request(
            $this->fields,
            ServiceFields::fromValues($this->serviceValues),
            (new DateTimeImmutable($this->receivedAt))->setTimezone($timezone),
        );
    }

    /** The report of the attempts so far; the worker adds the results of the next attempt to it. */
    public function report(): DeliveryReport
    {
        $report = new DeliveryReport();
        foreach ($this->channelResults as $channelName => $result) {
            $report->add($channelName, $result['delivered'] ? ChannelResult::delivered() : ChannelResult::failed($result['reason']));
        }
        return $report;
    }

    public function isDeliveredTo(string $channelName): bool
    {
        return $this->channelResults[$channelName]['delivered'] ?? false;
    }
}
