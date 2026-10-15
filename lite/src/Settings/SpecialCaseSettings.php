<?php
// The `cases` section of the settings: an ordered list of special cases, each with an optional name, `when` (form,
// and/or field with equals; at least one condition), `channels` (channel numbers from 1, or channel names) and an
// optional `required` list. It finds the problems of the section for the settings check, each naming the case and
// its field, and makes the SpecialCase objects of a checked section.

declare(strict_types=1);

namespace Formgate\Settings;

use Formgate\Routing\SpecialCase;

final class SpecialCaseSettings
{
    private const CONDITIONS = ['form', 'field', 'equals'];

    /**
     * @param mixed $cases the `cases` section
     * @param array<mixed> $channels the `channels` section
     * @return list<string> the problems, for example `case #1 vacancies: channels (no channel 5)`
     */
    public static function problems(mixed $cases, array $channels): array
    {
        if (!is_array($cases) || !array_is_list($cases)) {
            return ['cases'];
        }
        $problems = [];
        foreach ($cases as $index => $case) {
            $problems = [...$problems, ...self::caseProblems($index + 1, $case, $channels)];
        }
        return $problems;
    }

    /**
     * @param list<array<string, mixed>> $cases a section without problems
     * @param list<array<string, mixed>> $channels
     * @return list<SpecialCase>
     */
    public static function cases(array $cases, array $channels): array
    {
        return array_map(fn (array $case, int $index): SpecialCase => new SpecialCase(
            $index + 1,
            $case['name'] ?? '',
            $case['when'],
            array_map(fn (int|string $channel): int => (int) self::channelIndex($channel, $channels), $case['channels']),
            $case['required'] ?? [],
        ), $cases, array_keys($cases));
    }

    /**
     * @param array<mixed> $channels
     * @return list<string>
     */
    private static function caseProblems(int $number, mixed $case, array $channels): array
    {
        if (!is_array($case)) {
            return ["case #{$number}"];
        }
        $name = $case['name'] ?? null;
        $label = trim("case #{$number} " . (is_string($name) ? $name : ''));
        return array_values(array_filter([
            $name === null || is_string($name) ? null : "{$label}: name",
            self::isWhen($case['when'] ?? null) ? null : "{$label}: when",
            self::channelsProblem($label, $case['channels'] ?? null, $channels),
            self::isNameList($case['required'] ?? []) ? null : "{$label}: required",
        ]));
    }

    /** At least one condition, no unknown key, a non-empty form, and a field always with its value. */
    private static function isWhen(mixed $when): bool
    {
        if (!is_array($when) || array_diff(array_keys($when), self::CONDITIONS) !== []) {
            return false;
        }
        $hasField = array_key_exists('field', $when) || array_key_exists('equals', $when);
        $isField = self::isName($when['field'] ?? null) && (is_string($when['equals'] ?? null) || is_int($when['equals'] ?? null));
        $isForm = !array_key_exists('form', $when) || self::isName($when['form']);
        return ($hasField || array_key_exists('form', $when)) && (!$hasField || $isField) && $isForm;
    }

    /**
     * @param array<mixed> $channels
     * @return ?string the problem of the case channels, null when there is none
     */
    private static function channelsProblem(string $label, mixed $references, array $channels): ?string
    {
        if (!is_array($references) || !array_is_list($references) || $references === []) {
            return "{$label}: channels";
        }
        foreach ($references as $reference) {
            if (!is_int($reference) && !is_string($reference)) {
                return "{$label}: channels";
            }
            if (self::channelIndex($reference, $channels) === null) {
                return "{$label}: channels (no channel {$reference})";
            }
        }
        return null;
    }

    /**
     * The place (from 0) of the channel that a case names by its number (from 1) or by its name.
     *
     * @param array<mixed> $channels
     */
    private static function channelIndex(int|string $reference, array $channels): ?int
    {
        if (is_int($reference)) {
            return $reference >= 1 && $reference <= count($channels) ? $reference - 1 : null;
        }
        foreach ($channels as $index => $channel) {
            if (is_array($channel) && ($channel['name'] ?? null) === $reference) {
                return $index;
            }
        }
        return null;
    }

    private static function isNameList(mixed $names): bool
    {
        return is_array($names) && array_is_list($names) && count(array_filter($names, self::isName(...))) === count($names);
    }

    private static function isName(mixed $name): bool
    {
        return is_string($name) && trim($name) !== '';
    }
}
