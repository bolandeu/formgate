<?php
// The Telegram channel: one Bot API message per request, with the request lines as the text.
// Options: the options of TelegramBot.

declare(strict_types=1);

namespace Formgate\Channels;

use Formgate\Intake\Request;
use RuntimeException;

final class TelegramChannel implements Channel
{
    private readonly TelegramBot $bot;

    /** @param array<string, mixed> $options */
    public function __construct(array $options)
    {
        $this->bot = new TelegramBot($options, 'the telegram channel');
    }

    public function send(Request $request): ChannelResult
    {
        try {
            $this->bot->send(implode("\n", $request->lines()));
        } catch (RuntimeException $error) {
            return ChannelResult::failed('Telegram: ' . $error->getMessage());
        }
        return ChannelResult::delivered();
    }
}
