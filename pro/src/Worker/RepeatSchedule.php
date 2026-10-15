<?php
// The repeat schedule: the pause before each repeat of a request that a channel did not accept. The first pause
// starts at the first failure, each next pause at the failure of the previous repeat. After the last pause there is
// no next attempt.

declare(strict_types=1);

namespace Formgate\Pro\Worker;

use DateTimeImmutable;

final class RepeatSchedule
{
    /** @param list<int> $pauseSeconds */
    public function __construct(private readonly array $pauseSeconds)
    {
    }

    /** The time of the next attempt after the given number of failed attempts, or null when the schedule is over. */
    public function nextAttemptAt(int $failedAttempts, DateTimeImmutable $now): ?DateTimeImmutable
    {
        $pause = $this->pauseSeconds[$failedAttempts - 1] ?? null;
        return $pause === null ? null : $now->modify("+{$pause} seconds");
    }
}
