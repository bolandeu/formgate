<?php
// The clock of Lite and Pro: the time now, or FORMGATE_TEST_NOW, which only the tests set to move the clock.

declare(strict_types=1);

namespace Formgate;

use DateTimeImmutable;
use DateTimeZone;

final class Clock
{
    public static function now(DateTimeZone $timezone): DateTimeImmutable
    {
        $testNow = (string) getenv('FORMGATE_TEST_NOW');
        return new DateTimeImmutable($testNow !== '' ? $testNow : 'now', $timezone);
    }
}
