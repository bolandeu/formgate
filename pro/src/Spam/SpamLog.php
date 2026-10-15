<?php
// The spam log of Pro for the operator: lists the entries and releases one. A release turns an entry of a token reason
// into a normal queued request (with the time it came, its service fields and its route by the project settings now)
// and removes it from the spam log, in
// one transaction, so the worker delivers it to the channels of the project. An entry of another reason is a bot, not
// a visitor, and stays.

declare(strict_types=1);

namespace Formgate\Pro\Spam;

use Formgate\Channels\ChannelFactory;
use Formgate\Intake\Request;
use Formgate\Intake\ServerData;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Formgate\Routing\Route;
use Formgate\Routing\Router;
use Formgate\Spam\SpamReason;
use Formgate\Storage\SqliteStorage;

final class SpamLog
{
    private const COLUMNS = "id, COALESCE(project_key, '') AS project_key, received_at, reason, fields, service, "
        . 'request_id, ip, user_agent, origin_host';

    /** @var array<string, ?Router> the router of each project key asked for, null for a project that is gone */
    private array $routers = [];

    private function __construct(
        private readonly Database $db,
        private readonly Queue $queue,
        private readonly ProjectRegistry $projects,
    ) {
    }

    /** Opens the spam log in the Pro database and makes its tables when they are not there. */
    public static function open(ProConfig $config): self
    {
        SqliteStorage::makeProjectTables($config->databaseFile(), $config->sqliteBusyTimeoutSeconds());
        $db = new Database($config);
        return new self($db, new Queue($db), new ProjectRegistry($config->projectsDir()));
    }

    /** @return list<SpamEntry> all entries, in the order they came */
    public function entries(): array
    {
        $rows = $this->db->run('SELECT ' . self::COLUMNS . ' FROM spam_log ORDER BY id')->fetchAll();
        return array_map(self::entry(...), $rows);
    }

    /**
     * @param string $id the id as the operator typed it: a text that is no number finds no entry
     * @throws ReleaseRefused when the entry is not there, belongs to no project or has a reason that is no token reason
     */
    public function release(string $id): void
    {
        $this->db->transaction(function () use ($id): void {
            $row = $this->db->run('SELECT ' . self::COLUMNS . ' FROM spam_log WHERE id = ?', [$id])->fetch();
            $entry = $row === false ? throw new ReleaseRefused("spam log entry {$id} not found") : self::entry($row);
            if (!$entry->reason->isTokenReason()) {
                throw new ReleaseRefused("spam log entry {$id} has the reason {$entry->reason->value}: only a token reason can be released");
            }
            if ($entry->projectKey === '') {
                throw new ReleaseRefused("spam log entry {$id} has no project");
            }
            $request = $entry->request();
            $this->queue->add($entry->projectKey, $request, $this->routeOf($entry->projectKey, $request));
            $this->db->run('DELETE FROM spam_log WHERE id = ?', [$id]);
        });
    }

    /**
     * The route of the request by the project settings now; the default route when the project is gone. The project
     * file is read once for each project.
     *
     * @throws \Throwable when the project file does not load
     */
    public function routeOf(string $projectKey, Request $request): Route
    {
        if (!array_key_exists($projectKey, $this->routers)) {
            $settings = $this->projects->find($projectKey);
            $this->routers[$projectKey] = $settings === null ? null : new Router($settings, new ChannelFactory());
        }
        return $this->routers[$projectKey]?->route($request) ?? new Route(null, []);
    }

    /** @param array<string, string> $row */
    private static function entry(array $row): SpamEntry
    {
        return new SpamEntry(
            (int) $row['id'],
            $row['project_key'],
            $row['received_at'],
            SpamReason::from($row['reason']),
            json_decode($row['fields'], true, 512, JSON_THROW_ON_ERROR),
            json_decode($row['service'], true, 512, JSON_THROW_ON_ERROR),
            array_intersect_key($row, array_flip(ServerData::NAMES)),
        );
    }
}
