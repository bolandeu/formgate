<?php
// The project routes of the admin API: create from a JSON body {external_id, name, domain, channel:{type, options}}
// with the checks of `project:create`, idempotent by the external id (an id that exists gives 200 with its project
// and changes nothing), and show by key or by external id. A project goes out with its secrets masked; a refused
// input is 422 invalid with the reason.

declare(strict_types=1);

namespace Formgate\Pro\Admin;

use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectChannels;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Projects\SecretMask;
use Formgate\Response\Response;
use InvalidArgumentException;
use RuntimeException;

final class AdminProjects
{
    public function __construct(private readonly ProjectRegistry $registry, private readonly ProjectChannels $channels)
    {
    }

    public function create(string $body): Response
    {
        try {
            $input = self::input($body);
            [$key, $isNew] = $this->registry->createForExternalId(
                $input['external_id'],
                ProjectChanges::newProject($input['name'], $input['domain'], $input['channel']['type'], $input['channel']['options']),
                $this->channels->verifyLast(...),
            );
        } catch (InvalidArgumentException | RuntimeException $refusal) {
            return self::invalid($refusal);
        }
        return $this->project($isNew ? 201 : 200, $key);
    }

    public function show(string $key): Response
    {
        if ($this->registry->find($key) === null) {
            return self::notFound();
        }
        return $this->project(200, $key);
    }

    /** The answer to a key that has no project. */
    public static function notFound(): Response
    {
        return Response::json(404, ['ok' => false, 'code' => 'project_not_found']);
    }

    /** The answer to a refused input or change, with the reason. */
    public static function invalid(InvalidArgumentException | RuntimeException $refusal): Response
    {
        return Response::json(422, ['ok' => false, 'code' => 'invalid', 'error' => $refusal->getMessage()]);
    }

    public function showByExternalId(string $externalId): Response
    {
        return $this->show($this->registry->keyOfExternalId($externalId) ?? '');
    }

    /** The answer with the project of the key, its secrets masked. */
    public function project(int $status, string $key): Response
    {
        $values = $this->registry->values($key);
        return Response::json($status, ['ok' => true, 'project' => [
            'key' => $key,
            'external_id' => $values['project']['external_id'] ?? null,
            'name' => $values['project']['name'] ?? '',
            'domains' => $values['project']['domains'],
            'channels' => SecretMask::mask($values['channels']),
            'form_path' => "/f/{$key}",
        ]]);
    }

    /**
     * The fields of a create body; a field of a wrong type throws with its name.
     *
     * @return array{external_id: string, name: string, domain: string, channel: array{type: string, options: array<string, mixed>}}
     */
    private static function input(string $body): array
    {
        $input = AdminBody::object($body);
        foreach (['external_id', 'name', 'domain'] as $name) {
            AdminBody::text($input, $name);
        }
        $channel = $input['channel'] ?? null;
        if (!is_array($channel) || !is_string($channel['type'] ?? null) || $channel['type'] === '' || !is_array($channel['options'] ?? null)) {
            throw new InvalidArgumentException('channel: must be an object {type, options}');
        }
        return $input;
    }
}
