<?php
// Keeps the secrets of a project out of what the CLI prints: masks the secret values of the settings (tokens,
// passwords, keys, webhook addresses) and scrubs a text of every secret value the settings hold.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

final class SecretMask
{
    private const SECRET_NAME = '/token|password|secret|key|webhook/i';
    private const MASK = '***';

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function mask(array $values): array
    {
        $masked = [];
        foreach ($values as $name => $value) {
            $isSecret = is_string($value) && $value !== '' && preg_match(self::SECRET_NAME, (string) $name) === 1;
            $masked[$name] = match (true) {
                $isSecret => self::MASK,
                is_array($value) => self::mask($value),
                default => $value,
            };
        }
        return $masked;
    }

    /** @param array<string, mixed> $values */
    public static function scrub(string $text, array $values): string
    {
        $secrets = [];
        array_walk_recursive($values, function (mixed $value, string|int $name) use (&$secrets): void {
            if (is_string($value) && $value !== '' && preg_match(self::SECRET_NAME, (string) $name) === 1) {
                $secrets[] = $value;
            }
        });
        return str_replace($secrets, self::MASK, $text);
    }
}
