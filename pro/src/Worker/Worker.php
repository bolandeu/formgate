<?php
// The Pro worker: takes the due queued requests and gives each an attempt on the repeat schedule (each channel
// that did not accept it gets it again), deletes the old entries at most once an hour and marks its heartbeat.

declare(strict_types=1);

namespace Formgate\Pro\Worker;

use DateTimeZone;
use Formgate\Clock;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;

final class Worker
{
    public const HEARTBEAT = 'worker';

    public function __construct(
        private readonly Queue $queue,
        private readonly RequestDelivery $delivery,
        private readonly Cleanup $cleanup,
        private readonly Heartbeats $heartbeats,
    ) {
    }

    public static function fromConfig(ProConfig $config): self
    {
        $db = new Database($config);
        $queue = new Queue($db);
        $heartbeats = new Heartbeats($db);
        return new self($queue, RequestDelivery::create($config, $db, $queue), new Cleanup($config, $db, $queue, $heartbeats), $heartbeats);
    }

    public function runOnce(): void
    {
        $now = Clock::now(new DateTimeZone('UTC'));
        foreach ($this->queue->due($now) as $queued) {
            $this->delivery->onSchedule($queued, $now);
        }
        $this->cleanup->runIfDue($now);
        $this->heartbeats->mark(self::HEARTBEAT, $now);
    }
}
