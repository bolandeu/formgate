<?php
// The SQLite storage: one database file above the site root. Each write is one BEGIN IMMEDIATE transaction,
// so parallel requests wait for each other (up to the busy timeout of the settings) and never interleave.
// Pro gives a project key: then the spam log, the rate hits and the duplicates belong to that project, and the
// database has no requests table (Pro keeps the requests in its queue).

declare(strict_types=1);

namespace Formgate\Storage;

use DateTimeImmutable;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Intake\ServerData;
use Formgate\Routing\Route;
use Formgate\Spam\SpamReason;
use LogicException;
use PDO;
use PDOStatement;
use Throwable;

final class SqliteStorage implements Storage
{
    private const REQUESTS_TABLE = 'CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL,'
        . ' form TEXT NOT NULL, fields TEXT NOT NULL, status TEXT NOT NULL, channels TEXT NOT NULL,'
        . ' route TEXT NOT NULL DEFAULT \'default\')';

    /** The tables of the spam records, the same for a Lite site and a project. */
    private const SPAM_TABLES = [
        'CREATE TABLE IF NOT EXISTS spam_log (id INTEGER PRIMARY KEY, received_at TEXT NOT NULL, form TEXT NOT NULL,'
            . ' fields TEXT NOT NULL, service TEXT NOT NULL DEFAULT \'{}\', reason TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS rate_hits (key TEXT NOT NULL, at INTEGER NOT NULL)',
        'CREATE TABLE IF NOT EXISTS duplicates (hash TEXT PRIMARY KEY, until INTEGER NOT NULL)',
    ];

    private readonly PDO $db;

    /** @param ?string $projectKey The project of the records; null for a Lite site. */
    public function __construct(
        string $file,
        int $busyTimeoutSeconds,
        private readonly Retention $retention,
        private readonly ?string $projectKey = null,
    ) {
        $this->db = self::open($file, $busyTimeoutSeconds, $projectKey !== null);
    }

    /** Makes the tables of the project records in a Pro database, for a process that writes no records (the worker). */
    public static function makeProjectTables(string $file, int $busyTimeoutSeconds): void
    {
        self::open($file, $busyTimeoutSeconds, true);
    }

    private static function open(string $file, int $busyTimeoutSeconds, bool $forProject): PDO
    {
        $db = new PDO("sqlite:{$file}", null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => $busyTimeoutSeconds,
        ]);
        foreach ($forProject ? self::SPAM_TABLES : [self::REQUESTS_TABLE, ...self::SPAM_TABLES] as $statement) {
            $db->exec($statement);
        }
        self::upgrade($db, $forProject);
        return $db;
    }

    public function kind(): string
    {
        return 'sqlite';
    }

    public function saveRequest(Request $request, Route $route, DeliveryReport $report): void
    {
        if ($this->projectKey !== null) {
            throw new LogicException('A storage of a project keeps no requests: Pro keeps them in its queue');
        }
        $this->insert('requests', Records::request($request, $route, $report), $request->receivedAt);
    }

    public function logSpam(Request $request, SpamReason $reason): void
    {
        $record = Records::spam($request, $reason);
        $this->insert('spam_log', $this->projectKey === null ? $record : $record + ['project_key' => $this->projectKey], $request->receivedAt);
    }

    public function countHit(string $key, DateTimeImmutable $at, int $windowSeconds): int
    {
        return self::transaction($this->db, function () use ($key, $at, $windowSeconds): int {
            $this->run('DELETE FROM rate_hits WHERE at <= ?', [$at->getTimestamp() - $windowSeconds]);
            $key = $this->scoped($key);
            $this->run('INSERT INTO rate_hits (key, at) VALUES (?, ?)', [$key, $at->getTimestamp()]);
            return (int) $this->run('SELECT COUNT(*) FROM rate_hits WHERE key = ?', [$key])->fetchColumn();
        });
    }

    public function isRepeated(string $hash, DateTimeImmutable $at, int $windowSeconds): bool
    {
        return self::transaction($this->db, function () use ($hash, $at, $windowSeconds): bool {
            $hash = $this->scoped($hash);
            $this->run('DELETE FROM duplicates WHERE until <= ?', [$at->getTimestamp()]);
            if ($this->run('SELECT 1 FROM duplicates WHERE hash = ?', [$hash])->fetchColumn() !== false) {
                return true;
            }
            $this->run('INSERT INTO duplicates (hash, until) VALUES (?, ?)', [$hash, $at->getTimestamp() + $windowSeconds]);
            return false;
        });
    }

    /** @param array<string, mixed> $record */
    private function insert(string $table, array $record, DateTimeImmutable $now): void
    {
        self::transaction($this->db, function () use ($table, $record, $now): void {
            $columns = implode(', ', array_keys($record));
            $places = implode(', ', array_fill(0, count($record), '?'));
            $values = array_map(fn (mixed $value): string => is_array($value) ? Records::json($value) : (string) $value, $record);
            $this->run("INSERT INTO {$table} ({$columns}) VALUES ({$places})", array_values($values));
            $this->deleteOld($now);
        });
    }

    private function deleteOld(DateTimeImmutable $now): void
    {
        $cutoff = $this->retention->cutoff($now);
        if ($cutoff !== null) {
            if ($this->projectKey === null) {
                $this->run('DELETE FROM requests WHERE received_at < ?', [$cutoff]);
            }
            $this->run('DELETE FROM spam_log WHERE received_at < ?', [$cutoff]);
        }
    }

    /**
     * Brings a database of an older version to the tables above. The spam log keeps the service field values: an
     * older database has the table without that column, and its entries get none. The spam log of a project names the
     * project: a database made by Pro v0.3.0 has the table without that column. A Lite request keeps its route: an older
     * database has the requests without that column, and they read as the default route. The requests and the spam log keep the server data:
     * an older database has the tables without those columns, and their rows read them as empty. The duplicate store keeps the end of
     * each window: an older database has the time of the record instead, so its hashes end at the upgrade. The checks
     * and the changes are one transaction, so two processes at the upgrade do not both change a table.
     */
    private static function upgrade(PDO $db, bool $forProject): void
    {
        self::transaction($db, function () use ($db, $forProject): void {
            if (!in_array('service', self::columns($db, 'spam_log'), true)) {
                $db->exec('ALTER TABLE spam_log ADD COLUMN service TEXT NOT NULL DEFAULT \'{}\'');
            }
            if ($forProject && !in_array('project_key', self::columns($db, 'spam_log'), true)) {
                $db->exec('ALTER TABLE spam_log ADD COLUMN project_key TEXT');
            }
            if (!$forProject && !in_array('route', self::columns($db, 'requests'), true)) {
                $db->exec('ALTER TABLE requests ADD COLUMN route TEXT NOT NULL DEFAULT \'default\'');
            }
            foreach ($forProject ? ['spam_log'] : ['requests', 'spam_log'] as $table) {
                self::addServerColumns($db, $table);
            }
            if (in_array('at', self::columns($db, 'duplicates'), true)) {
                $db->exec('ALTER TABLE duplicates RENAME COLUMN at TO until');
            }
        });
    }

    /** Adds the columns of the server data that the table lacks: the rows of an older database read them as empty. */
    private static function addServerColumns(PDO $db, string $table): void
    {
        foreach (array_diff(ServerData::NAMES, self::columns($db, $table)) as $name) {
            $db->exec("ALTER TABLE {$table} ADD COLUMN {$name} TEXT NOT NULL DEFAULT ''");
        }
    }

    /** @return list<string> the column names of the table */
    private static function columns(PDO $db, string $table): array
    {
        return array_column($db->query("PRAGMA table_info({$table})")->fetchAll(PDO::FETCH_ASSOC), 'name');
    }

    /** The key of a rate counter or a duplicate hash, split by project. */
    private function scoped(string $key): string
    {
        return $this->projectKey === null ? $key : "{$this->projectKey} {$key}";
    }

    /** @param list<string|int> $parameters */
    private function run(string $sql, array $parameters): PDOStatement
    {
        $statement = $this->db->prepare($sql);
        $statement->execute($parameters);
        return $statement;
    }

    /**
     * Runs the work as one write transaction on the database: the other writers wait, and an error undoes all of it.
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public static function transaction(PDO $db, callable $work): mixed
    {
        $db->exec('BEGIN IMMEDIATE');
        try {
            $result = $work();
            $db->exec('COMMIT');
            return $result;
        } catch (Throwable $error) {
            $db->exec('ROLLBACK');
            throw $error;
        }
    }
}
