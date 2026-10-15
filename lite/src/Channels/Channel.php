<?php
// The channel interface: a place where Lite delivers a request. ChannelFactory finds an implementation by the
// channel type of the settings (`telegram` => TelegramChannel), so a new channel is one new file.

declare(strict_types=1);

namespace Formgate\Channels;

use Formgate\Intake\Request;

interface Channel
{
    /** @param array<string, mixed> $options the channel options of the settings */
    public function __construct(array $options);

    /** Delivers the request; a failure is a result with the reason, never an exception. */
    public function send(Request $request): ChannelResult;
}
