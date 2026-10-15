<?php
// The HTTP side of Pro: two paths, no router (ADR 0001). POST and GET /f/<key> run the Lite kernel with the settings
// of the project, the queue as its delivery, and time tokens of the project signed with FORMGATE_TOKEN_SECRET; a key
// without a project gets 404 project_not_found and nothing is stored. GET /health answers the health. Any other path
// gets an empty 404.

declare(strict_types=1);

namespace Formgate\Pro\Http;

use Formgate\Intake\HttpRequest;
use Formgate\Kernel;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Health\Health;
use Formgate\Pro\Token\EnvironmentSigningKey;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Formgate\Pro\Queue\QueueDelivery;
use Formgate\Response\ErrorCode;
use Formgate\Response\Response;
use Formgate\Spam\SpamFilterFactory;
use Formgate\Storage\Retention;
use Formgate\Storage\SqliteStorage;
use Formgate\Token\TimeTokens;

final class Gateway
{
    private const FORM_PATH = '~^/f/([^/]+)$~';

    public function __construct(private readonly ProConfig $config)
    {
    }

    public function handle(string $path, HttpRequest $http): Response
    {
        if ($path === '/health') {
            return (new Health($this->config))->answer();
        }
        if (preg_match(self::FORM_PATH, $path, $match) === 1) {
            return $this->intake($match[1], $http);
        }
        return new Response(404);
    }

    private function intake(string $key, HttpRequest $http): Response
    {
        $settings = (new ProjectRegistry($this->config->projectsDir()))->find($key);
        if ($settings === null) {
            return Response::failure(ErrorCode::ProjectNotFound);
        }
        $storage = new SqliteStorage(
            $this->config->databaseFile(),
            $this->config->sqliteBusyTimeoutSeconds(),
            new Retention(null),
            $key,
        );
        $timeTokens = new TimeTokens(new EnvironmentSigningKey($this->config), $key, $settings, $storage);
        $kernel = new Kernel(
            $settings,
            $storage,
            SpamFilterFactory::create($settings, $storage, $timeTokens),
            new QueueDelivery(new Queue(new Database($this->config)), $key),
            new NoSelfCheck(),
            $timeTokens,
        );
        return $kernel->handle($http);
    }
}
