<?php
// The change routes of the admin API: domains, channels, delete and self-check of a project. Each change goes through
// ProjectChanges and the registry lock like the CLI, so two changes of one project run one after the other and none
// is lost. A change answers 200 with the project (secrets masked); a refused change is 422 invalid and writes
// nothing; an unknown key is 404 project_not_found.

declare(strict_types=1);

namespace Formgate\Pro\Admin;

use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectChannels;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Projects\ProjectSelfCheck;
use Formgate\Pro\Projects\SecretMask;
use Formgate\Response\Response;
use Formgate\Settings\Settings;
use Formgate\Token\SigningKey;
use InvalidArgumentException;
use RuntimeException;

final class AdminChanges
{
    public function __construct(
        private readonly ProjectRegistry $registry,
        private readonly AdminProjects $projects,
        private readonly SigningKey $signingKey,
    ) {
    }

    public function addDomain(string $key, string $body): Response
    {
        return $this->change($key, fn (array $values): array => ProjectChanges::addDomain($values, AdminBody::text(AdminBody::object($body), 'domain')));
    }

    public function removeDomain(string $key, string $domain): Response
    {
        return $this->change($key, fn (array $values): array => ProjectChanges::removeDomain($values, $domain));
    }

    public function addChannel(string $key, string $body): Response
    {
        return $this->change($key, function (array $values) use ($body): array {
            $input = AdminBody::object($body);
            $name = $input['name'] ?? null;
            if ($name !== null && !is_string($name)) {
                throw new InvalidArgumentException('name: must be a string');
            }
            return ProjectChanges::addChannel($values, AdminBody::text($input, 'type'), self::options($input), $name);
        }, ProjectChannels::verifyLast(...));
    }

    public function changeChannel(string $key, int $number, string $body): Response
    {
        return $this->change(
            $key,
            fn (array $values): array => ProjectChanges::changeChannel($values, $number, self::options(AdminBody::object($body))),
            fn (Settings $settings) => ProjectChannels::verify($settings, $number),
        );
    }

    public function removeChannel(string $key, int $number): Response
    {
        return $this->change($key, fn (array $values): array => ProjectChanges::removeChannel($values, $number));
    }

    public function delete(string $key, bool $confirmed): Response
    {
        return $this->whenFound($key, function () use ($key, $confirmed): Response {
            if (!$confirmed) {
                return Response::json(400, ['ok' => false, 'code' => 'confirm_required']);
            }
            $this->registry->delete($key);
            return Response::json(200, ['ok' => true]);
        });
    }

    /** The findings of the project self-check, with a test send through each channel when the body says `send: true`. */
    public function selfCheck(string $key, string $body): Response
    {
        return $this->whenFound($key, function (Settings $settings) use ($key, $body): Response {
            $send = $body !== '' && (AdminBody::object($body)['send'] ?? false) === true;
            $secrets = $this->registry->values($key);
            $findings = array_map(
                fn ($finding): array => [
                    'level' => $finding->level,
                    'label' => $finding->label,
                    'detail' => SecretMask::scrub($finding->detail, $secrets),
                ],
                ProjectSelfCheck::run($settings, $this->signingKey, $send),
            );
            return Response::json(200, ['ok' => true, 'findings' => $findings]);
        });
    }

    /**
     * @param callable(array<string, mixed>): array<string, mixed> $edit
     * @param (callable(Settings): void)|null $verify
     */
    private function change(string $key, callable $edit, ?callable $verify = null): Response
    {
        return $this->whenFound($key, function () use ($key, $edit, $verify): Response {
            $this->registry->change($key, $edit, $verify);
            return $this->projects->project(200, $key);
        });
    }

    /** @param callable(Settings): Response $work gets the settings of the project */
    private function whenFound(string $key, callable $work): Response
    {
        $settings = $this->registry->find($key);
        if ($settings === null) {
            return AdminProjects::notFound();
        }
        try {
            return $work($settings);
        } catch (InvalidArgumentException | RuntimeException $refusal) {
            return AdminProjects::invalid($refusal);
        }
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private static function options(array $input): array
    {
        if (!is_array($input['options'] ?? null)) {
            throw new InvalidArgumentException('options: must be an object');
        }
        return $input['options'];
    }
}
