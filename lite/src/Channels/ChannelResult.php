<?php
// The result of one delivery to a channel: delivered, or failed with the reason for error_log and alerts.

declare(strict_types=1);

namespace Formgate\Channels;

final class ChannelResult
{
    private function __construct(public readonly bool $isDelivered, public readonly string $reason)
    {
    }

    public static function delivered(): self
    {
        return new self(true, '');
    }

    public static function failed(string $reason): self
    {
        return new self(false, $reason);
    }
}
