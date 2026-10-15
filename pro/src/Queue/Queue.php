<?php
// The Pro queue: one table of requests with the project key, the route (Route::name(); a request queued before
// routing took the default route), the status (queued until the worker sends it, then
// the status of its delivery report, and not delivered after the last repeat), the result of each channel, the
// number of attempts and the time of the next attempt. A request waits for an attempt while it is queued, partial or
// failed; it is due when its due time has come.

declare(strict_types=1);

namespace Formgate\Pro\Queue;

use DateTimeImmutable;
use Formgate\Channels\DeliveryReport;
use Formgate\Channels\DeliveryStatus;
use Formgate\Intake\Request;
use Formgate\Routing\Route;
use Formgate\Storage\Records;

final class Queue
{
    private const QUEUED = 'queued';
    private const NOT_DELIVERED = 'not_delivered';
    private const COLUMNS = 'id, project_key, fields, service, received_at, attempts, channels, route';

    public function __construct(private readonly Database $db)
    {
        $db->run(
            'CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY, project_key TEXT NOT NULL,'
            . ' received_at TEXT NOT NULL, form TEXT NOT NULL, fields TEXT NOT NULL, service TEXT NOT NULL,'
            . ' status TEXT NOT NULL, channels TEXT NOT NULL, due_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,'
            . ' route TEXT NOT NULL DEFAULT \'default\')',
        );
        $db->transaction(function () use ($db): void {
            $columns = array_column($db->run('PRAGMA table_info(queue)')->fetchAll(), 'name');
            if (!in_array('route', $columns, true)) {
                $db->run('ALTER TABLE queue ADD COLUMN route TEXT NOT NULL DEFAULT \'default\'');
            }
        });
    }

    /** Stores the request with its route and status queued, due at once. */
    public function add(string $projectKey, Request $request, Route $route): void
    {
        $receivedAt = Records::time($request->receivedAt);
        $this->db->run(
            'INSERT INTO queue (project_key, received_at, form, fields, service, status, channels, due_at, route)'
            . ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $projectKey,
                $receivedAt,
                $request->service->form,
                Records::json($request->fields),
                Records::json($request->service->values()),
                self::QUEUED,
                '{}',
                $receivedAt,
                $route->name(),
            ],
        );
    }

    /** @return list<QueuedRequest> the requests that wait for an attempt and whose due time has come, in the order they came */
    public function due(DateTimeImmutable $now): array
    {
        return $this->select(
            'status IN (?, ?, ?) AND due_at <= ?',
            [self::QUEUED, DeliveryStatus::Partial->value, DeliveryStatus::Failed->value, Records::time($now)],
        );
    }

    /** @return list<QueuedRequest> the requests not delivered, of one project or of all, in the order they came */
    public function notDelivered(?string $projectKey = null): array
    {
        return $projectKey === null
            ? $this->select('status = ?', [self::NOT_DELIVERED])
            : $this->select('status = ? AND project_key = ?', [self::NOT_DELIVERED, $projectKey]);
    }

    /**
     * Records the results of the channels and the attempt. With a time for the next attempt the request keeps waiting;
     * without one it is delivered, or not delivered when a channel still fails.
     */
    public function record(int $id, DeliveryReport $report, int $attempts, ?DateTimeImmutable $nextAttemptAt): void
    {
        $status = $report->status() === DeliveryStatus::Delivered || $nextAttemptAt !== null
            ? $report->status()->value
            : self::NOT_DELIVERED;
        $this->db->run(
            'UPDATE queue SET status = ?, channels = ?, attempts = ?, due_at = COALESCE(?, due_at) WHERE id = ?',
            [
                $status,
                Records::json((object) $report->results()),
                $attempts,
                $nextAttemptAt === null ? null : Records::time($nextAttemptAt),
                $id,
            ],
        );
    }

    /** Deletes the requests that came before the stored time (Records::time). */
    public function deleteBefore(string $cutoff): void
    {
        $this->db->run('DELETE FROM queue WHERE received_at < ?', [$cutoff]);
    }

    /**
     * @param list<string|int> $parameters
     * @return list<QueuedRequest>
     */
    private function select(string $where, array $parameters): array
    {
        $rows = $this->db->run('SELECT ' . self::COLUMNS . " FROM queue WHERE {$where} ORDER BY id", $parameters)->fetchAll();
        return array_map(fn (array $row): QueuedRequest => new QueuedRequest(
            (int) $row['id'],
            $row['project_key'],
            json_decode($row['fields'], true, 512, JSON_THROW_ON_ERROR),
            json_decode($row['service'], true, 512, JSON_THROW_ON_ERROR),
            $row['received_at'],
            (int) $row['attempts'],
            json_decode($row['channels'], true, 512, JSON_THROW_ON_ERROR),
            $row['route'],
        ), $rows);
    }
}
