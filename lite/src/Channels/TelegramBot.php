<?php
// One Telegram bot: sends a text to its chat through the Bot API sendMessage. TelegramChannel delivers requests
// with it and TelegramAlerter sends operator alerts with it.
// Options: bot_token, chat_id, api_url (the Bot API host, a fake server in tests), timeout_seconds.

declare(strict_types=1);

namespace Formgate\Channels;

use RuntimeException;

final class TelegramBot
{
    private readonly string $sendMessageUrl;
    private readonly string $chatId;
    private readonly Http $http;

    /**
     * @param array<string, mixed> $options
     * @param string $owner the owner of the options for a settings error, for example `the telegram channel`
     */
    public function __construct(array $options, string $owner)
    {
        RequiredOptions::check($options, ['bot_token', 'chat_id', 'api_url', 'timeout_seconds'], $owner);
        $this->sendMessageUrl = rtrim((string) $options['api_url'], '/') . "/bot{$options['bot_token']}/sendMessage";
        $this->chatId = (string) $options['chat_id'];
        $this->http = new Http((int) $options['timeout_seconds']);
    }

    /** Sends the text; a transport error or an answer without `ok` throws with the reason. */
    public function send(string $text): void
    {
        $answer = $this->http->postJson($this->sendMessageUrl, ['chat_id' => $this->chatId, 'text' => $text]);
        if ($answer['status'] !== 200 || (json_decode($answer['body'], true)['ok'] ?? false) !== true) {
            throw new RuntimeException("HTTP {$answer['status']}: " . substr($answer['body'], 0, 300));
        }
    }
}
