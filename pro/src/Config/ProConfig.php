<?php
// The global Pro configuration: the environment variables of defaults.php, each with its default when it is not
// set. A variable without a value and without a default throws, so Pro never runs half set up.

declare(strict_types=1);

namespace Formgate\Pro\Config;

use RuntimeException;

final class ProConfig
{
    /** @param array<string, string> $values variable name => value */
    private function __construct(private readonly array $values)
    {
    }

    public static function fromEnvironment(): self
    {
        $values = [];
        foreach (require __DIR__ . '/defaults.php' as $name => $default) {
            $value = (string) getenv($name);
            $values[$name] = $value !== '' ? $value : ($default ?? throw new RuntimeException("config: set {$name}"));
        }
        return new self($values);
    }

    public function projectsDir(): string
    {
        return $this->values['FORMGATE_PROJECTS_DIR'];
    }

    /** The SQLite database file in the data folder. */
    public function databaseFile(): string
    {
        return rtrim($this->values['FORMGATE_DATA_DIR'], '/') . '/formgate.sqlite';
    }

    public function sqliteBusyTimeoutSeconds(): int
    {
        return (int) $this->values['FORMGATE_SQLITE_BUSY_TIMEOUT_SECONDS'];
    }

    public function workerHeartbeatMaxAgeSeconds(): int
    {
        return (int) $this->values['FORMGATE_WORKER_HEARTBEAT_MAX_AGE_SECONDS'];
    }

    public function workerPauseSeconds(): int
    {
        return (int) $this->values['FORMGATE_WORKER_PAUSE_SECONDS'];
    }

    /** @return list<int> the pauses of the repeat schedule in seconds */
    public function repeatScheduleSeconds(): array
    {
        return array_map('intval', explode(',', $this->values['FORMGATE_REPEAT_SCHEDULE_SECONDS']));
    }

    public function channelDownAfterFailures(): int
    {
        return (int) $this->values['FORMGATE_CHANNEL_DOWN_AFTER_FAILURES'];
    }

    public function retentionDays(): int
    {
        return (int) $this->values['FORMGATE_RETENTION_DAYS'];
    }

    public function retentionIntervalSeconds(): int
    {
        return (int) $this->values['FORMGATE_RETENTION_INTERVAL_SECONDS'];
    }

    /** The signing secret of time tokens; empty when the operator has not set it. */
    public function tokenSecret(): string
    {
        return $this->values['FORMGATE_TOKEN_SECRET'];
    }

    /** @return list<string> the keys of the admin API; none when the API is off */
    public function adminKeys(): array
    {
        return array_values(array_filter(array_map(trim(...), explode(',', $this->values['FORMGATE_ADMIN_KEYS'])), fn (string $key): bool => $key !== ''));
    }

    /**
     * The options of the operator alert bot, or null when no token is set.
     *
     * @return array{bot_token: string, chat_id: string, api_url: string, timeout_seconds: int}|null
     */
    public function alertBot(): ?array
    {
        if ($this->values['FORMGATE_ALERT_BOT_TOKEN'] === '') {
            return null;
        }
        if ($this->values['FORMGATE_ALERT_CHAT_ID'] === '') {
            throw new RuntimeException('config: set FORMGATE_ALERT_CHAT_ID for the alert bot');
        }
        return [
            'bot_token' => $this->values['FORMGATE_ALERT_BOT_TOKEN'],
            'chat_id' => $this->values['FORMGATE_ALERT_CHAT_ID'],
            'api_url' => $this->values['FORMGATE_ALERT_API_URL'],
            'timeout_seconds' => (int) $this->values['FORMGATE_ALERT_TIMEOUT_SECONDS'],
        ];
    }
}
