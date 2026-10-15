<?php
// The signing key of Lite: a random secret in the file formgate-token-key of the storage place (above the site root,
// else a guarded file in the Lite folder), so a web server never serves it. The first token request makes it under the
// file lock, so parallel first requests share one key.

declare(strict_types=1);

namespace Formgate\Token;

use Formgate\Storage\JsonlFile;
use Formgate\Storage\StoragePlace;

final class StoredSigningKey implements SigningKey
{
    /** 256 bits, the size of the HMAC-SHA256 output. */
    private const SECRET_BYTES = 32;

    private readonly JsonlFile $file;

    public function __construct(StoragePlace $place)
    {
        $this->file = $place->jsonlFile('token-key');
    }

    public function exists(): bool
    {
        return $this->file->records() !== [];
    }

    public function secret(): string
    {
        $records = $this->file->update(fn (array $records): array => $records !== [] ? $records : [self::newSecret()]);
        return (string) $records[0]['secret'];
    }

    /** @return array{secret: string} */
    private static function newSecret(): array
    {
        return ['secret' => bin2hex(random_bytes(self::SECRET_BYTES))];
    }
}
