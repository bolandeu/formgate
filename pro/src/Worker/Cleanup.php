<?php
// The retention of Pro: the worker deletes the requests and the spam log entries older than the configured days,
// at most once in the configured interval (the time of the last cleanup is a heartbeat of the database).

declare(strict_types=1);

namespace Formgate\Pro\Worker;

use DateTimeImmutable;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Formgate\Storage\Retention;
use Formgate\Storage\SqliteStorage;

final class Cleanup
{
    private const HEARTBEAT = 'cleanup';

    public function __construct(
        private readonly ProConfig $config,
        private readonly Database $db,
        private readonly Queue $queue,
        private readonly Heartbeats $heartbeats,
    ) {
        // The spam log table belongs to the Lite storage, which makes it when it opens; the worker may run before
        // any request was checked.
        SqliteStorage::makeProjectTables($config->databaseFile(), $config->sqliteBusyTimeoutSeconds());
    }

    public function runIfDue(DateTimeImmutable $now): void
    {
        $last = $this->heartbeats->last(self::HEARTBEAT);
        if ($last !== null && $now->getTimestamp() - $last->getTimestamp() < $this->config->retentionIntervalSeconds()) {
            return;
        }
        $cutoff = (new Retention($this->config->retentionDays()))->cutoff($now);
        if ($cutoff !== null) {
            $this->queue->deleteBefore($cutoff);
            $this->db->run('DELETE FROM spam_log WHERE received_at < ?', [$cutoff]);
        }
        $this->heartbeats->mark(self::HEARTBEAT, $now);
    }
}
