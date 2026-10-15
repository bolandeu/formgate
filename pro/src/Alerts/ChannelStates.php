<?php
// The state of each channel of each project, kept in the Pro database: the failures in a row and whether the channel
// is down. A channel goes down at the configured number of failures in a row on any requests and up again at the
// first success. The operator gets one alert for each change, not for each failure.

declare(strict_types=1);

namespace Formgate\Pro\Alerts;

use Formgate\Channels\ChannelResult;
use Formgate\Pro\Queue\Database;

final class ChannelStates
{
    public function __construct(
        private readonly Database $db,
        private readonly OperatorAlerts $alerts,
        private readonly int $downAfterFailures,
    ) {
        $db->run(
            'CREATE TABLE IF NOT EXISTS channel_states (project_key TEXT NOT NULL, channel TEXT NOT NULL,'
            . ' failures INTEGER NOT NULL, is_down INTEGER NOT NULL, PRIMARY KEY (project_key, channel))',
        );
    }

    /** Counts one delivery attempt of the channel and alerts the operator when it changes the state. */
    public function record(string $projectKey, string $channelName, ChannelResult $result): void
    {
        $row = $this->db->run(
            'SELECT failures, is_down FROM channel_states WHERE project_key = ? AND channel = ?',
            [$projectKey, $channelName],
        )->fetch();
        $wasDown = $row !== false && (int) $row['is_down'] === 1;
        $failures = $result->isDelivered ? 0 : ($row === false ? 0 : (int) $row['failures']) + 1;
        $isDown = !$result->isDelivered && ($wasDown || $failures >= $this->downAfterFailures);
        $this->db->run(
            'INSERT OR REPLACE INTO channel_states (project_key, channel, failures, is_down) VALUES (?, ?, ?, ?)',
            [$projectKey, $channelName, $failures, (int) $isDown],
        );
        if ($isDown && !$wasDown) {
            $this->alerts->channelDown($projectKey, $channelName, $failures, $result->reason);
        } elseif ($wasDown && !$isDown) {
            $this->alerts->channelUp($projectKey, $channelName);
        }
    }
}
