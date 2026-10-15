<?php
// The admin API of Pro, on its own port: a tool with an admin key creates and shows projects over JSON. The keys
// come from FORMGATE_ADMIN_KEYS; a request with `Authorization: Bearer <key>` of any listed key is served, compared in
// constant time; no or a wrong key gets 401 unauthorized. An empty key list turns the API off: every path is 404.
// Routes: POST /admin/projects, GET /admin/projects?external_id=<id>, GET /admin/projects/<key>; any other is 404.

declare(strict_types=1);

namespace Formgate\Pro\Admin;

use Formgate\Intake\HttpRequest;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Response\Response;

final class AdminApi
{
    private const PROJECTS_PATH = '/admin/projects';
    private const PROJECT_PATH = '~^/admin/projects/([^/]+)$~';
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
        $projects = new AdminProjects(new ProjectRegistry($this->config->projectsDir()));
        $externalId = $http->query['external_id'] ?? null;
        return match (true) {
            $http->method === 'POST' && $path === self::PROJECTS_PATH => $projects->create($http->body),
            $http->method === 'GET' && $path === self::PROJECTS_PATH && is_string($externalId) => $projects->showByExternalId($externalId),
            $http->method === 'GET' && preg_match(self::PROJECT_PATH, $path, $match) === 1 => $projects->show($match[1]),
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
