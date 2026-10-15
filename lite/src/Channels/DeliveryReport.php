<?php
// The results of delivering one request to each channel of its route, by channel name. The kernel stores it with
// its status, alerts the operator when a channel failed and answers delivery_failed when no channel delivered.

declare(strict_types=1);

namespace Formgate\Channels;

final class DeliveryReport
{
    /** @var array<string, ChannelResult> */
    private array $results = [];

    public function add(string $channelName, ChannelResult $result): void
    {
        $this->results[$channelName] = $result;
    }

    public function isAnyDelivered(): bool
    {
        return $this->deliveredChannels() !== [];
    }

    /** @return list<string> the names of the channels that delivered the request */
    public function deliveredChannels(): array
    {
        $delivered = array_filter($this->results, fn (ChannelResult $result): bool => $result->isDelivered);
        return array_keys($delivered);
    }

    public function status(): DeliveryStatus
    {
        if (!$this->isAnyDelivered()) {
            return DeliveryStatus::Failed;
        }
        return $this->failures() === [] ? DeliveryStatus::Delivered : DeliveryStatus::Partial;
    }

    /** @return array<string, array{delivered: bool, reason: string}> channel name => its result */
    public function results(): array
    {
        return array_map(
            fn (ChannelResult $result): array => ['delivered' => $result->isDelivered, 'reason' => $result->reason],
            $this->results,
        );
    }

    /** @return array<string, string> channel name => reason of the failure */
    public function failures(): array
    {
        $failed = array_filter($this->results, fn (ChannelResult $result): bool => !$result->isDelivered);
        return array_map(fn (ChannelResult $result): string => $result->reason, $failed);
    }
}
