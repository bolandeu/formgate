<?php
// The heartbeats in the Pro database: the last time a process marked itself, by name. The worker marks `worker`
// after each run; GET /health marks `health`, which also shows that the database is writable.

declare(strict_types=1);

namespace Formgate\Pro\Worker;

use DateTimeImmutable;
use Formgate\Pro\Queue\Database;
use Formgate\Storage\Records;

final class Heartbeats
{
    public function __construct(private readonly Database $db)
    {
        $db->run('CREATE TABLE IF NOT EXISTS heartbeats (name TEXT PRIMARY KEY, at TEXT NOT NULL)');
    }

    public function mark(string $name, DateTimeImmutable $at): void
    {
        $this->db->run('INSERT OR REPLACE INTO heartbeats (name, at) VALUES (?, ?)', [$name, Records::time($at)]);
    }

    /** The last mark of the name, or null when it never marked. */
    public function last(string $name): ?DateTimeImmutable
    {
        $at = $this->db->run('SELECT at FROM heartbeats WHERE name = ?', [$name])->fetchColumn();
        return $at === false ? null : new DateTimeImmutable($at);
    }
}
