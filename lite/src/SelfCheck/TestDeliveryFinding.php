<?php
// The finding about the test delivery: a warning when it is on, because then no request reaches a channel.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Delivery\TestDeliveryFile;

final class TestDeliveryFinding
{
    private const LABEL = 'Test delivery';

    public static function of(): Finding
    {
        $file = TestDeliveryFile::path();
        return $file === null
            ? Finding::ok(self::LABEL, 'off')
            : Finding::warning(self::LABEL, "on: requests go to {$file} and no channel is called");
    }
}
