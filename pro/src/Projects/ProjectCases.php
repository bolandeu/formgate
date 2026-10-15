<?php
// The special-case side of the project edits, each a pure function from the values of a settings file to the new
// values: add, move and remove a case, and the cases that use a channel. The registry validates the result with the
// Lite validator before it writes, so a case with a wrong channel or no condition is refused with its field.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

use InvalidArgumentException;

final class ProjectCases
{
    /**
     * Adds a case at the end. A channel word of digits is a channel number, any other word is a channel name.
     *
     * @param array<string, mixed> $values
     * @param array{name: ?string, form: ?string, field: ?string, equals: ?string} $details
     * @param list<string> $channels
     * @param list<string> $required
     * @return array<string, mixed>
     */
    public static function add(array $values, array $details, array $channels, array $required): array
    {
        $when = array_filter(['form' => $details['form'], 'field' => $details['field'], 'equals' => $details['equals']], fn (?string $condition): bool => $condition !== null);
        $case = ['when' => $when, 'channels' => array_map(fn (string $word): int|string => ctype_digit($word) ? (int) $word : $word, $channels)];
        if ($details['name'] !== null) {
            $case['name'] = $details['name'];
        }
        if ($required !== []) {
            $case['required'] = $required;
        }
        $values['cases'][] = $case;
        return $values;
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function move(array $values, int $number, int $place): array
    {
        $index = self::index($values, $number);
        if ($place < 1 || $place > count($values['cases'])) {
            throw new InvalidArgumentException("cases: no place {$place}, the project has " . count($values['cases']) . ' cases');
        }
        $case = array_splice($values['cases'], $index, 1);
        array_splice($values['cases'], $place - 1, 0, $case);
        return $values;
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function remove(array $values, int $number): array
    {
        $index = self::index($values, $number);
        array_splice($values['cases'], $index, 1);
        return $values;
    }

    /**
     * The cases that name the channel with the given number, by number or by the name of the channel.
     *
     * @param array<string, mixed> $values
     * @return list<string> the labels of the cases, `case #1 vacancies`
     */
    public static function usingChannel(array $values, int $number): array
    {
        $name = $values['channels'][$number - 1]['name'] ?? null;
        return self::labelsOf($values, fn (int|string $channel): bool => $channel === $number || ($name !== null && $channel === $name));
    }

    /**
     * The cases that name a channel by a number above the given one: the removal of that channel shifts the number,
     * and the case would silently go to another channel.
     *
     * @param array<string, mixed> $values
     * @return list<string> the labels of the cases, `case #1 vacancies`
     */
    public static function namingChannelAfter(array $values, int $number): array
    {
        return self::labelsOf($values, fn (int|string $channel): bool => is_int($channel) && $channel > $number);
    }

    /**
     * One case for people: `#1 vacancies | form=vacancy | channels 2 | required email`.
     *
     * @param array<string, mixed> $case
     */
    public static function describe(int $number, array $case): string
    {
        $when = $case['when'];
        $conditions = array_filter([
            isset($when['form']) ? "form={$when['form']}" : null,
            isset($when['field']) ? "field {$when['field']}={$when['equals']}" : null,
        ]);
        return trim("#{$number} " . ($case['name'] ?? '')) . ' | ' . implode(', ', $conditions)
            . ' | channels ' . implode(', ', $case['channels'])
            . ' | required ' . (($case['required'] ?? []) === [] ? '-' : implode(', ', $case['required']));
    }

    /**
     * @param array<string, mixed> $values
     * @param callable(int|string): bool $names true for a channel reference of the case that counts
     * @return list<string>
     */
    private static function labelsOf(array $values, callable $names): array
    {
        $labels = [];
        foreach ($values['cases'] ?? [] as $index => $case) {
            if (array_filter($case['channels'], $names) !== []) {
                $labels[] = trim('case #' . ($index + 1) . ' ' . ($case['name'] ?? ''));
            }
        }
        return $labels;
    }

    /** @param array<string, mixed> $values */
    private static function index(array $values, int $number): int
    {
        if ($number < 1 || $number > count($values['cases'] ?? [])) {
            throw new InvalidArgumentException("cases: the project has no case number {$number}");
        }
        return $number - 1;
    }
}
