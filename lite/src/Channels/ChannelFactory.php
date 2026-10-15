<?php
// Makes a channel from its settings. The class is found by convention from the type name:
// `telegram` => Formgate\Channels\TelegramChannel, `bitrix24` => Bitrix24Channel, `webhook` => WebhookChannel.
// The webhook channel gets the address guard of the factory (Pro); Lite has none.

declare(strict_types=1);

namespace Formgate\Channels;

use RuntimeException;

final class ChannelFactory
{
    public function __construct(private readonly ?AddressGuard $addressGuard = null)
    {
    }

    /** @param array<string, mixed> $options */
    public function create(string $type, array $options): Channel
    {
        $class = __NAMESPACE__ . '\\' . ucfirst($type) . 'Channel';
        if (preg_match('/^[a-z][a-z0-9]*$/', $type) !== 1 || !is_subclass_of($class, Channel::class)) {
            throw new RuntimeException("settings: unknown channel type '{$type}'");
        }
        return $class === WebhookChannel::class ? new WebhookChannel($options, $this->addressGuard) : new $class($options);
    }
}
