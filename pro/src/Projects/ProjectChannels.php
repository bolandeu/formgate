<?php
// The channel side of the project edits: the options a CLI call gives as `name=value` words, and the check that a
// channel of validated settings can be built, so a channel with a missing option (a telegram channel with no chat_id)
// is refused before the registry writes.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

use Formgate\Channels\ChannelFactory;
use Formgate\Settings\Settings;
use InvalidArgumentException;

final class ProjectChannels
{
    /** The help of the CLI option that gives one `name=value` word to options(). */
    public const OPTION_HELP = 'A channel option as name=value; a value of [..] or {..} is JSON';

    /**
     * Options from `name=value` words. A value that starts with `[` or `{` is read as JSON (a list of recipients, a
     * field map, the email methods); any other value stays a string.
     *
     * @param list<string> $words
     * @return array<string, mixed>
     */
    public static function options(array $words): array
    {
        $options = [];
        foreach ($words as $word) {
            if (!str_contains($word, '=')) {
                throw new InvalidArgumentException("option: '{$word}' must look like name=value");
            }
            [$name, $value] = explode('=', $word, 2);
            $options[$name] = self::value($name, $value);
        }
        return $options;
    }

    /** Builds the channel with the given number (the first is 1) from the settings; a missing option throws. */
    public static function verify(Settings $settings, int $number): void
    {
        $channel = $settings->channels()[$number - 1];
        (new ChannelFactory())->create($channel['type'], $channel['options']);
    }

    /** Builds the last channel of the settings, the one that create and add write; a missing option throws. */
    public static function verifyLast(Settings $settings): void
    {
        self::verify($settings, count($settings->channels()));
    }

    private static function value(string $name, string $value): mixed
    {
        if ($value === '' || ($value[0] !== '[' && $value[0] !== '{')) {
            return $value;
        }
        $decoded = json_decode($value, true);
        if (!is_array($decoded)) {
            throw new InvalidArgumentException("option {$name}: not valid JSON");
        }
        return $decoded;
    }
}
