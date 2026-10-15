<?php
// The edits of the project settings that the CLI makes, each a pure function from the values of a settings file to
// the new values: a new project, the domains, the channels and the plain settings (thank-you and error pages,
// retention and limits). The registry validates the result before it writes; a wrong request throws with the field.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

use Formgate\Settings\Settings;
use InvalidArgumentException;

final class ProjectChanges
{
    /** The settings that `set` changes, other than the limits: path => type (`string`, `list`, `int`, `int-or-none`, `bool`). */
    private const SETTABLE = [
        'project.thank_you_url' => 'string',
        'project.error_url' => 'string',
        'project.retention_days' => 'int-or-none',
        'project.duplicate_window_seconds' => 'int',
        'project.rate_limit.requests' => 'int',
        'project.rate_limit.window_seconds' => 'int',
        'project.required' => 'list',
        'project.require_token' => 'bool',
        'project.token_min_seconds' => 'int',
        'project.token_max_seconds' => 'int',
    ];

    /**
     * A new project: the name, the first domain and the first channel. A plain form post goes to the home page of the
     * domain after it is sent or failed, because the Lite validator wants both pages; `project:set` changes them.
     *
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public static function newProject(string $name, string $domain, string $type, array $options): array
    {
        $domain = self::domain($domain);
        $home = "https://{$domain}/";
        $project = ['name' => $name, 'domains' => [$domain], 'thank_you_url' => $home, 'error_url' => $home];
        return self::addChannel(['project' => $project, 'channels' => []], $type, $options);
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function addDomain(array $values, string $domain): array
    {
        $domain = self::domain($domain);
        $values['project']['domains'] = array_values(array_unique([...$values['project']['domains'] ?? [], $domain]));
        return $values;
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function removeDomain(array $values, string $domain): array
    {
        $domain = self::domain($domain);
        $domains = $values['project']['domains'] ?? [];
        if (!in_array($domain, $domains, true)) {
            throw new InvalidArgumentException("project.domains: {$domain} is not a domain of the project");
        }
        if (count($domains) === 1) {
            throw new InvalidArgumentException("project.domains: cannot remove {$domain}, a project needs at least one domain");
        }
        $values['project']['domains'] = array_values(array_diff($domains, [$domain]));
        return $values;
    }

    /**
     * @param array<string, mixed> $values
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public static function addChannel(array $values, string $type, array $options): array
    {
        $values['channels'][] = ['type' => $type, 'options' => $options];
        return $values;
    }

    /**
     * Puts the options over the options of the channel with the given number (`telegram #2` is number 2).
     *
     * @param array<string, mixed> $values
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public static function changeChannel(array $values, int $number, array $options): array
    {
        $index = self::channelIndex($values, $number);
        $values['channels'][$index]['options'] = $options + $values['channels'][$index]['options'];
        return $values;
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function removeChannel(array $values, int $number): array
    {
        $index = self::channelIndex($values, $number);
        $cases = ProjectCases::usingChannel($values, $number);
        if ($cases !== []) {
            throw new InvalidArgumentException("channels: cannot remove channel {$number}, it is used by " . implode(', ', $cases));
        }
        $shifted = ProjectCases::namingChannelAfter($values, $number);
        if ($shifted !== []) {
            throw new InvalidArgumentException("channels: cannot remove channel {$number}, the channels after it get lower numbers and "
                . implode(', ', $shifted) . ' would go to another channel; remove the case first');
        }
        if (count($values['channels']) === 1) {
            throw new InvalidArgumentException('channels: cannot remove the only channel, a project needs at least one channel');
        }
        array_splice($values['channels'], $index, 1);
        return $values;
    }

    /**
     * Sets one setting by its dotted path, for example `project.retention_days` or `limits.max_fields`.
     *
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function set(array $values, string $path, string $value): array
    {
        $type = self::settable()[$path] ?? throw new InvalidArgumentException(
            "{$path}: not a setting to change; choose from " . implode(', ', array_keys(self::settable())),
        );
        $typed = match ($type) {
            'string' => $value,
            'list' => array_values(array_filter(array_map(trim(...), explode(',', $value)), fn (string $word): bool => $word !== '')),
            'bool' => self::truth($path, $value),
            'int-or-none' => $value === 'none' ? null : self::wholeNumber($path, $value, ' or none'),
            default => self::wholeNumber($path, $value, ''),
        };
        $target = &$values;
        foreach (explode('.', $path) as $step) {
            $target = &$target[$step];
        }
        $target = $typed;
        self::checkTokenLimits($values, $path);
        return $values;
    }

    /**
     * The Lite validator does not compare the token limits, so `set` does: the minimum stays below the maximum, the
     * Lite default standing in for a limit that the project does not set.
     *
     * @param array<string, mixed> $values
     */
    private static function checkTokenLimits(array $values, string $path): void
    {
        if ($path !== 'project.token_min_seconds' && $path !== 'project.token_max_seconds') {
            return;
        }
        $defaults = Settings::defaults();
        $min = $values['project']['token_min_seconds'] ?? $defaults->tokenMinSeconds();
        $max = $values['project']['token_max_seconds'] ?? $defaults->tokenMaxSeconds();
        if ($min >= $max) {
            throw new InvalidArgumentException("{$path}: token_min_seconds ({$min}) must be below token_max_seconds ({$max})");
        }
    }

    /** @return array<string, string> path => type, the limits of the Lite defaults included */
    private static function settable(): array
    {
        $limits = array_fill_keys(array_map(fn (string $name): string => "limits.{$name}", Settings::limitNames()), 'int');
        return self::SETTABLE + $limits;
    }

    private static function truth(string $path, string $value): bool
    {
        return match (strtolower($value)) {
            'true', 'on', '1' => true,
            'false', 'off', '0' => false,
            default => throw new InvalidArgumentException("{$path}: must be true or false (also on/off, 1/0), got '{$value}'"),
        };
    }

    private static function wholeNumber(string $path, string $value, string $orWord): int
    {
        if (preg_match('/^\d+$/', $value) !== 1) {
            throw new InvalidArgumentException("{$path}: must be a whole number{$orWord}, got '{$value}'");
        }
        return (int) $value;
    }

    private static function domain(string $domain): string
    {
        $domain = strtolower(trim($domain));
        if (preg_match('/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/', $domain) !== 1) {
            throw new InvalidArgumentException("project.domains: '{$domain}' is not a host name");
        }
        return $domain;
    }

    /** @param array<string, mixed> $values */
    private static function channelIndex(array $values, int $number): int
    {
        if ($number < 1 || $number > count($values['channels'] ?? [])) {
            throw new InvalidArgumentException("channels: the project has no channel number {$number}");
        }
        return $number - 1;
    }
}
