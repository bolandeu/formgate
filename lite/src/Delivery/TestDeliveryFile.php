<?php
// The test delivery switch: FORMGATE_TEST_DELIVERY_FILE is test-only, only the tests of a site set it, an operator
// never does. When it names a file, Lite calls no channel and appends each delivered request to that file as a JSON line
// (TestDelivery).

declare(strict_types=1);

namespace Formgate\Delivery;

final class TestDeliveryFile
{
    /** The file of the test delivery, or null when the variable is not set (or empty) and delivery is normal. */
    public static function path(): ?string
    {
        $path = (string) getenv('FORMGATE_TEST_DELIVERY_FILE');
        return $path === '' ? null : $path;
    }
}
