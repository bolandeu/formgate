<?php
// Lite settings, also the settings of one Pro project: reads the operator's settings file (Lite finds it by
// SettingsLocator, Pro by the project key), merges it over defaults.php and gives
// the modules typed values. A missing or invalid file throws, so the kernel never runs half set up.

declare(strict_types=1);

namespace Formgate\Settings;

use DateTimeZone;
use Formgate\Routing\SpecialCase;
use RuntimeException;

final class Settings
{
    /** @param array<string, mixed> $values */
    private function __construct(private readonly array $values, private readonly string $file)
    {
    }

    /** The settings of the file that SettingsLocator finds. */
    public static function load(): self
    {
        return self::fromFile(SettingsLocator::find(dirname(__DIR__, 2)));
    }

    /** The defaults alone, for the moment when the settings file is missing or invalid. */
    public static function defaults(): self
    {
        return new self(require __DIR__ . '/defaults.php', '');
    }

    /** The settings of the given file. */
    public static function fromFile(string $file): self
    {
        if (!is_file($file)) {
            throw new RuntimeException("settings: no settings file {$file}");
        }
        $values = require $file;
        if (!is_array($values)) {
            throw new RuntimeException("settings: the file {$file} does not return an array");
        }
        $settings = new self(self::merge(require __DIR__ . '/defaults.php', $values), $file);
        $settings->validate($file);
        return $settings;
    }

    /** The path of the settings file. */
    public function file(): string
    {
        return $this->file;
    }

    /** @return list<string> */
    public function domains(): array
    {
        return $this->values['project']['domains'];
    }

    /** The name of the project in operator alerts; validate() makes it set when the settings have an alert bot. */
    public function projectName(): string
    {
        return $this->values['project']['name'];
    }

    /**
     * The operator alert bot with the Telegram channel defaults under it, or null when the settings have none.
     *
     * @return array<string, mixed>|null bot_token, chat_id, api_url, timeout_seconds
     */
    public function alert(): ?array
    {
        $alert = $this->values['alert'];
        return self::hasAlertBot($alert) ? $alert + $this->values['channel_defaults']['telegram'] : null;
    }

    public function consentField(): string
    {
        return $this->values['project']['consent_field'];
    }

    /** True when a plain form post gets the JSON answer instead of a 303 to a result page. */
    public function plainFormGetsJson(): bool
    {
        return $this->values['project']['plain_form_answer'] === 'json';
    }

    public function thankYouUrl(): string
    {
        return $this->values['project']['thank_you_url'];
    }

    public function errorUrl(): string
    {
        return $this->values['project']['error_url'];
    }

    public function honeypotField(): string
    {
        return $this->values['project']['honeypot_field'];
    }

    /** @return list<string> */
    public function trustedProxies(): array
    {
        return $this->values['project']['trusted_proxies'];
    }

    /** The most requests from one visitor IP to one form within the rate window. */
    public function rateLimitRequests(): int
    {
        return (int) $this->values['project']['rate_limit']['requests'];
    }

    public function rateLimitWindowSeconds(): int
    {
        return (int) $this->values['project']['rate_limit']['window_seconds'];
    }

    public function duplicateWindowSeconds(): int
    {
        return (int) $this->values['project']['duplicate_window_seconds'];
    }

    /** True when a request needs a valid time token to reach the channels. */
    public function requiresToken(): bool
    {
        return (bool) $this->values['project']['require_token'];
    }

    /** The lower limit of the token age: a request sent sooner is too fast. */
    public function tokenMinSeconds(): int
    {
        return (int) $this->values['project']['token_min_seconds'];
    }

    /** The upper limit of the token age: a request sent later is expired. */
    public function tokenMaxSeconds(): int
    {
        return (int) $this->values['project']['token_max_seconds'];
    }

    /** Days to keep stored requests and the spam log; null keeps them forever. */
    public function retentionDays(): ?int
    {
        $days = $this->values['project']['retention_days'];
        return $days === null ? null : (int) $days;
    }

    public function sqliteBusyTimeoutSeconds(): int
    {
        return (int) $this->values['storage']['sqlite_busy_timeout_seconds'];
    }

    /** The secret key of the self-check page; null when the self-check is off. */
    public function selfCheckKey(): ?string
    {
        $key = $this->values['selfcheck_key'];
        return self::isSet($key) ? (string) $key : null;
    }

    public function timezone(): DateTimeZone
    {
        return new DateTimeZone($this->values['project']['timezone']);
    }

    /** @return list<string> The names of the `limits` section in the defaults, for example `max_fields`. */
    public static function limitNames(): array
    {
        return array_keys(self::defaults()->values['limits']);
    }

    /** One value of the `limits` section, for example `max_fields`. */
    public function limit(string $name): int
    {
        return (int) $this->values['limits'][$name];
    }

    /** @return list<string> the fields that every request of the project must have, whatever its route */
    public function requiredFields(): array
    {
        return $this->values['project']['required'];
    }

    /** @return list<SpecialCase> the special cases in the order of the settings */
    public function cases(): array
    {
        return SpecialCaseSettings::cases($this->values['cases'], $this->values['channels']);
    }

    /**
     * The channels in the order of the settings, each with the defaults of its type under its own options.
     *
     * @return list<array{type: string, name: string|null, options: array<string, mixed>}>
     */
    public function channels(): array
    {
        return array_map(fn (array $channel): array => [
            'type' => $channel['type'],
            'name' => $channel['name'] ?? null,
            'options' => $channel['options'] + ($this->values['channel_defaults'][$channel['type']] ?? []),
        ], $this->values['channels']);
    }

    private function validate(string $file): void
    {
        $problems = [
            ...$this->projectProblems(),
            ...array_filter([
                self::isListOf($this->values['channels'], self::isChannel(...)) && $this->values['channels'] !== []
                    ? null : 'channels',
                self::isAlert($this->values['alert']) ? null : 'alert',
            ]),
            ...SpecialCaseSettings::problems($this->values['cases'], (array) $this->values['channels']),
        ];
        if ($problems !== []) {
            throw new RuntimeException("settings: {$file} has no valid " . implode(', ', $problems));
        }
    }

    /** @return list<string> the keys of the `project` section that have no valid value */
    private function projectProblems(): array
    {
        $project = $this->values['project'];
        $redirects = $project['plain_form_answer'] === 'redirect';
        return array_values(array_filter([
            self::isListOf($project['domains'], is_string(...)) && $project['domains'] !== [] ? null : 'project.domains',
            $redirects || $project['plain_form_answer'] === 'json' ? null : 'project.plain_form_answer',
            !$redirects || self::isSet($project['thank_you_url']) ? null : 'project.thank_you_url',
            !$redirects || self::isSet($project['error_url']) ? null : 'project.error_url',
            self::isListOf($project['required'], is_string(...)) ? null : 'project.required',
            !self::hasAlertBot($this->values['alert']) || self::isSet($project['name']) ? null : 'project.name',
        ]));
    }

    private static function isListOf(mixed $value, callable $isItem): bool
    {
        return is_array($value) && array_is_list($value) && count(array_filter($value, $isItem)) === count($value);
    }

    /** No alert bot (bot_token and chat_id both null), or both are set: a half-set alert is an error. */
    private static function isAlert(mixed $alert): bool
    {
        if (!is_array($alert)) {
            return false;
        }
        $token = $alert['bot_token'] ?? null;
        $chatId = $alert['chat_id'] ?? null;
        return ($token === null && $chatId === null) || (self::isSet($token) && self::isSet($chatId));
    }

    private static function hasAlertBot(mixed $alert): bool
    {
        return is_array($alert) && ($alert['bot_token'] ?? $alert['chat_id'] ?? null) !== null;
    }

    private static function isSet(mixed $value): bool
    {
        return (is_string($value) || is_int($value)) && $value !== '';
    }

    /** A type and options, and an optional name that special cases can use instead of the channel number. */
    private static function isChannel(mixed $channel): bool
    {
        return is_array($channel) && is_string($channel['type'] ?? null) && is_array($channel['options'] ?? null)
            && (!isset($channel['name']) || (is_string($channel['name']) && $channel['name'] !== ''));
    }

    /**
     * Puts the values over the defaults. A section (an array with string keys) merges key by key;
     * a list or a plain value replaces the default.
     *
     * @param array<string, mixed> $defaults
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    private static function merge(array $defaults, array $values): array
    {
        foreach ($values as $key => $value) {
            $isSection = is_array($value) && !array_is_list($value) && is_array($defaults[$key] ?? null);
            $defaults[$key] = $isSection ? self::merge($defaults[$key], $value) : $value;
        }
        return $defaults;
    }
}
