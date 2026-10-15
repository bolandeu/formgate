<?php
// The route of one request: the default route (all channels of the settings) or the matched special case, and the
// required fields of the request (those of the project, of the case and of __required). It is stored with the request,
// so the operator sees which route the request took.

declare(strict_types=1);

namespace Formgate\Routing;

final class Route
{
    /** @param list<string> $required */
    public function __construct(private readonly ?SpecialCase $case, public readonly array $required)
    {
    }

    /** True when the channel at this place in the settings (from 0) gets the request. */
    public function hasChannel(int $index): bool
    {
        return $this->case === null || $this->case->hasChannel($index);
    }

    /** The route as it is stored and shown: `default`, or the special case, `case #1 vacancies`. */
    public function name(): string
    {
        return $this->case?->label() ?? 'default';
    }
}
