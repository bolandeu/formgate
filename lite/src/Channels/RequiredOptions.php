<?php
// The one rule for required options of a channel, a channel part or the alert bot: each one is set and not empty,
// else the settings are broken and the error names the owner and the option.

declare(strict_types=1);

namespace Formgate\Channels;

use RuntimeException;

final class RequiredOptions
{
    /**
     * @param array<string, mixed> $options
     * @param list<string> $names
     * @param string $owner the owner of the options in the error, for example `the telegram channel`
     */
    public static function check(array $options, array $names, string $owner): void
    {
        foreach ($names as $name) {
            if (($options[$name] ?? '') === '' || $options[$name] === []) {
                throw new RuntimeException("settings: {$owner} has no {$name}");
            }
        }
    }
}
