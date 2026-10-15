<?php
// The admin API of Pro, on its own port: a tool with an admin key creates, shows, changes and deletes projects over JSON. The keys
// come from FORMGATE_ADMIN_KEYS; a request with `Authorization: Bearer <key>` of any listed key is served, compared in
// constant time; no or a wrong key gets 401 unauthorized. An empty key list turns the API off: every path is 404.
// Routes: create, show and change a project (domains, channels), delete and self-check; any other is 404.

declare(strict_types=1);

namespace Formgate\Pro\Admin;

use Formgate\Intake\HttpRequest;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Token\EnvironmentSigningKey;
use Formgate\Response\Response;

final class AdminApi
{
    private const PROJECTS_PATH = '/admin/projects';
    private const BEARER = 'Bearer ';

    public function __construct(private readonly ProConfig $config)
    {
    }

    public function handle(string $path, HttpRequest $http): Response
    {
        $keys = $this->config->adminKeys();
        if ($keys === []) {
            return new Response(404);
        }
        if (!self::isAllowed($keys, $http->header('authorization'))) {
            return Response::json(401, ['ok' => false, 'code' => 'unauthorized']);
        }
        $registry = new ProjectRegistry($this->config->projectsDir());
        $projects = new AdminProjects($registry);
        $changes = new AdminChanges($registry, $projects, new EnvironmentSigningKey($this->config));
        $externalId = $http->query['external_id'] ?? null;
        $confirmed = ($http->query['confirm'] ?? null) === 'true';
        $route = $http->method . ' ' . $path;
        return match (true) {
            $route === 'POST ' . self::PROJECTS_PATH => $projects->create($http->body),
            $route === 'GET ' . self::PROJECTS_PATH && is_string($externalId) => $projects->showByExternalId($externalId),
            preg_match('~^GET /admin/projects/([^/]+)$~', $route, $m) === 1 => $projects->show($m[1]),
            preg_match('~^DELETE /admin/projects/([^/]+)$~', $route, $m) === 1 => $changes->delete($m[1], $confirmed),
            preg_match('~^POST /admin/projects/([^/]+)/domains$~', $route, $m) === 1 => $changes->addDomain($m[1], $http->body),
            preg_match('~^DELETE /admin/projects/([^/]+)/domains/([^/]+)$~', $route, $m) === 1 => $changes->removeDomain($m[1], $m[2]),
            preg_match('~^POST /admin/projects/([^/]+)/channels$~', $route, $m) === 1 => $changes->addChannel($m[1], $http->body),
            preg_match('~^PATCH /admin/projects/([^/]+)/channels/(\d+)$~', $route, $m) === 1 => $changes->changeChannel($m[1], (int) $m[2], $http->body),
            preg_match('~^DELETE /admin/projects/([^/]+)/channels/(\d+)$~', $route, $m) === 1 => $changes->removeChannel($m[1], (int) $m[2]),
            preg_match('~^POST /admin/projects/([^/]+)/selfcheck$~', $route, $m) === 1 => $changes->selfCheck($m[1], $http->body),
            default => new Response(404),
        };
    }

    /**
     * Compares the given key with every listed key in constant time, so the answer time does not tell which key or
     * which part of it matched.
     *
     * @param list<string> $keys
     */
    private static function isAllowed(array $keys, string $authorization): bool
    {
        if (!str_starts_with($authorization, self::BEARER)) {
            return false;
        }
        $given = substr($authorization, strlen(self::BEARER));
        $allowed = false;
        foreach ($keys as $key) {
            $allowed = hash_equals($key, $given) || $allowed;
        }
        return $allowed;
    }
}
