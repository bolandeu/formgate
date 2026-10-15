<?php
// Keeps the secrets of a project out of what the CLI and the admin API print: masks the secret values of the settings
// (tokens, passwords, keys, webhook addresses, the url of a webhook channel and every value of its headers option,
// whose header names stay visible) and scrubs a text of every secret value the settings hold.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

final class SecretMask
{
    private const SECRET_NAME = '/token|password|secret|key|webhook|^url$/i';
    // Every value under this name is a secret: a header of a webhook channel often carries a credential.
    private const SECRET_GROUP = 'headers';
    private const MASK = '***';

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function mask(array $values): array
    {
        return self::masked($values, false);
    }

    /** @param array<string, mixed> $values */
    public static function scrub(string $text, array $values): string
    {
        return str_replace(self::secrets($values, false), self::MASK, $text);
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    private static function masked(array $values, bool $allSecret): array
    {
        $masked = [];
        foreach ($values as $name => $value) {
            $masked[$name] = match (true) {
                self::isSecret($name, $value, $allSecret) => self::MASK,
                is_array($value) => self::masked($value, $allSecret || $name === self::SECRET_GROUP),
                default => $value,
            };
        }
        return $masked;
    }

    /**
     * @param array<string, mixed> $values
     * @return list<string>
     */
    private static function secrets(array $values, bool $allSecret): array
    {
        $secrets = [];
        foreach ($values as $name => $value) {
            if (is_array($value)) {
                $secrets = [...$secrets, ...self::secrets($value, $allSecret || $name === self::SECRET_GROUP)];
            } elseif (self::isSecret($name, $value, $allSecret)) {
                $secrets[] = $value;
            }
        }
        return $secrets;
    }

    private static function isSecret(string|int $name, mixed $value, bool $allSecret): bool
    {
        return is_string($value) && $value !== '' && ($allSecret || preg_match(self::SECRET_NAME, (string) $name) === 1);
    }
}
