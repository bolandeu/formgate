<?php
// The operator alerts of Pro: one Telegram bot for all projects. Each alert names the project key and the channel.
// Without a bot the alert is only logged. A failed alert is logged and never stops the worker.

declare(strict_types=1);

namespace Formgate\Pro\Alerts;

use Formgate\Channels\TelegramBot;
use Formgate\Pro\Config\ProConfig;
use Throwable;

final class OperatorAlerts
{
    public function __construct(private readonly ?TelegramBot $bot)
    {
    }

    public static function fromConfig(ProConfig $config): self
    {
        $options = $config->alertBot();
        return new self($options === null ? null : new TelegramBot($options, 'the Pro alert bot'));
    }

    /** @param array<string, string> $failures failed channel name => reason */
    public function notDelivered(string $projectKey, int $requestId, array $failures): void
    {
        $lines = ["Formgate, project {$projectKey}: request {$requestId} is not delivered after the last repeat"];
        foreach ($failures as $channelName => $reason) {
            $lines[] = "channel {$channelName} failed: {$reason}";
        }
        $this->send(implode("\n", $lines));
    }

    public function channelDown(string $projectKey, string $channelName, int $failuresInRow, string $reason): void
    {
        $this->send("Formgate, project {$projectKey}: channel {$channelName} is down after {$failuresInRow} failures in a row: {$reason}");
    }

    public function channelUp(string $projectKey, string $channelName): void
    {
        $this->send("Formgate, project {$projectKey}: channel {$channelName} is up again");
    }

    private function send(string $text): void
    {
        if ($this->bot === null) {
            error_log("formgate: operator alert, no alert bot is set: {$text}");
            return;
        }
        try {
            $this->bot->send($text);
        } catch (Throwable $error) {
            error_log('formgate: operator alert failed: ' . $error->getMessage());
        }
    }
}
