<?php
// The JSON body of an admin API call: an object, or a refusal with the field name.

declare(strict_types=1);

namespace Formgate\Pro\Admin;

use InvalidArgumentException;

final class AdminBody
{
    /** @return array<string, mixed> */
    public static function object(string $body): array
    {
        $input = json_decode($body, true);
        if (!is_array($input)) {
            throw new InvalidArgumentException('body: must be a JSON object');
        }
        return $input;
    }

    /**
     * The string field of the body; a missing, empty or non-string field throws with its name.
     *
     * @param array<string, mixed> $input
     */
    public static function text(array $input, string $name): string
    {
        if (!is_string($input[$name] ?? null) || $input[$name] === '') {
            throw new InvalidArgumentException("{$name}: must be a non-empty string");
        }
        return $input[$name];
    }
}
