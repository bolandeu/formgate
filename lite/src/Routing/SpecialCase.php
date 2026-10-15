<?php
// A special case of the project settings: when all its conditions hold for a request (the form name in __form, a
// field equal to a value), the request goes only to the channels of the case and also needs the required fields of
// the case. Values are compared without case and without outer spaces.

declare(strict_types=1);

namespace Formgate\Routing;

use Formgate\Intake\Request;

final class SpecialCase
{
    /**
     * @param int $number the place of the case in the settings, from 1
     * @param array{form?: string, field?: string, equals?: string|int} $when the conditions; the settings check that one is set
     * @param list<int> $channelIndexes the places of its channels in the settings, from 0
     * @param list<string> $required
     */
    public function __construct(
        private readonly int $number,
        private readonly string $name,
        private readonly array $when,
        private readonly array $channelIndexes,
        public readonly array $required,
    ) {
    }

    public function matches(Request $request): bool
    {
        $isForm = !isset($this->when['form']) || self::isSame($request->service->form, $this->when['form']);
        $isField = !isset($this->when['field']) || self::isSame($request->field($this->when['field']), (string) $this->when['equals']);
        return $isForm && $isField;
    }

    /** True when the channel at this place in the settings (from 0) is one of the case. */
    public function hasChannel(int $index): bool
    {
        return in_array($index, $this->channelIndexes, true);
    }

    /** The case for people: `case #1 vacancies`, or `case #1` without a name. */
    public function label(): string
    {
        return trim("case #{$this->number} {$this->name}");
    }

    private static function isSame(string $value, string $expected): bool
    {
        return mb_strtolower(trim($value)) === mb_strtolower(trim($expected));
    }
}
