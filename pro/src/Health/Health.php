<?php
// GET /health of Pro, for external monitoring: 200 ok when the database is writable and the worker heartbeat is
// younger than the limit of the configuration; else 503 with the failed check (`database` or `worker`) and the
// reason.

declare(strict_types=1);

namespace Formgate\Pro\Health;

use DateTimeZone;
use Formgate\Clock;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Worker\Heartbeats;
use Formgate\Pro\Worker\Worker;
use Formgate\Response\Response;
use Throwable;

final class Health
{
    private const HEARTBEAT = 'health';

    public function __construct(private readonly ProConfig $config)
    {
    }

    public function answer(): Response
    {
        $now = Clock::now(new DateTimeZone('UTC'));
        try {
            $heartbeats = new Heartbeats(new Database($this->config));
            $heartbeats->mark(self::HEARTBEAT, $now);
        } catch (Throwable $error) {
            return self::failure('database', 'the database is not writable: ' . $error->getMessage());
        }
        $workerAt = $heartbeats->last(Worker::HEARTBEAT);
        if ($workerAt === null) {
            return self::failure('worker', 'the worker has no heartbeat');
        }
        $age = $now->getTimestamp() - $workerAt->getTimestamp();
        $limit = $this->config->workerHeartbeatMaxAgeSeconds();
        if ($age >= $limit) {
            return self::failure('worker', "the worker heartbeat is {$age} seconds old, the limit is {$limit}");
        }
        return Response::json(200, ['ok' => true]);
    }

    private static function failure(string $check, string $reason): Response
    {
        return Response::json(503, ['ok' => false, 'check' => $check, 'error' => $reason]);
    }
}
