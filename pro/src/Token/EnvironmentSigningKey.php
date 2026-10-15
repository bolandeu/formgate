<?php
// The signing key of time tokens in Pro: the environment variable FORMGATE_TOKEN_SECRET, one key for all projects
// (a token carries its project in the signature). Without the variable the key is missing: a token request and the
// check of a posted token fail, so the visitor gets server_error and the project self-check names the variable.

declare(strict_types=1);

namespace Formgate\Pro\Token;

use Formgate\Pro\Config\ProConfig;
use Formgate\Token\SigningKey;
use RuntimeException;

final class EnvironmentSigningKey implements SigningKey
{
    public function __construct(private readonly ProConfig $config)
    {
    }

    public function exists(): bool
    {
        return $this->config->tokenSecret() !== '';
    }

    public function secret(): string
    {
        return $this->exists() ? $this->config->tokenSecret() : throw new RuntimeException('config: set FORMGATE_TOKEN_SECRET');
    }
}
