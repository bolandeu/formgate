<?php
// The SQLite database of Pro in the data folder: one connection that waits for other writers up to the busy
// timeout. The queue and the heartbeats keep their tables here; the Lite SqliteStorage, given a project key, keeps the
// spam log, rate hits and duplicates of each project in the same file.

declare(strict_types=1);

namespace Formgate\Pro\Queue;

use Formgate\Pro\Config\ProConfig;
use Formgate\Storage\SqliteStorage;
use PDO;
use PDOStatement;

final class Database
{
    private readonly PDO $pdo;

    public function __construct(ProConfig $config)
    {
        $this->pdo = new PDO('sqlite:' . $config->databaseFile(), null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => $config->sqliteBusyTimeoutSeconds(),
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    /** @param list<string|int|null> $parameters */
    public function run(string $sql, array $parameters = []): PDOStatement
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        return $statement;
    }

    /**
     * Runs the work as one write transaction (see SqliteStorage::transaction).
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public function transaction(callable $work): mixed
    {
        return SqliteStorage::transaction($this->pdo, $work);
    }
}
