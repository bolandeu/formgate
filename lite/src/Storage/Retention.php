<?php
// The retention of the settings: requests and spam log entries older than the given days are deleted.
// Without retention days nothing is deleted.

declare(strict_types=1);

namespace Formgate\Storage;

use DateTimeImmutable;

final class Retention
{
    public function __construct(private readonly ?int $days)
    {
    }

    /** The stored time (Records::time) before which entries are deleted; null keeps every entry. */
    public function cutoff(DateTimeImmutable $now): ?string
    {
        return $this->days === null ? null : Records::time($now->modify("-{$this->days} days"));
    }
}
