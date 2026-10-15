<?php
// The operator alert: one Telegram message from the alert bot of the settings. It names the project and the case
// (a channel failed and other channels delivered the request, or no channel delivered it), then each failed
// channel with its reason. It never shows request
// data. When the alert itself fails, only error_log.

declare(strict_types=1);

namespace Formgate\Alerts;

use Formgate\Channels\DeliveryReport;
use Formgate\Channels\TelegramBot;
use Formgate\Intake\Request;
use RuntimeException;

final class TelegramAlerter implements Alerter
{
    private readonly TelegramBot $bot;

    /** @param array<string, mixed> $options the `alert` section of the settings: the options of TelegramBot */
    public function __construct(private readonly string $projectName, array $options)
    {
        $this->bot = new TelegramBot($options, 'the alert');
    }

    public function alert(Request $request, DeliveryReport $report): void
    {
        $lines = ["Formgate, project {$this->projectName}: " . self::outcome($report)];
        foreach ($report->failures() as $channelName => $reason) {
            $lines[] = "channel {$channelName} failed: {$reason}";
        }
        try {
            $this->bot->send(implode("\n", $lines));
        } catch (RuntimeException $error) {
            error_log('formgate: alert failed: ' . $error->getMessage());
        }
    }

    private static function outcome(DeliveryReport $report): string
    {
        $delivered = $report->deliveredChannels();
        if ($delivered === []) {
            return 'no channel delivered the request';
        }
        $failed = implode(', ', array_keys($report->failures()));
        return "channel {$failed} failed, the request is delivered by " . implode(', ', $delivered);
    }
}
