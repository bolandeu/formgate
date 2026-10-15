<?php
// Chooses the delivery of Lite: the test delivery to a file when FORMGATE_TEST_DELIVERY_FILE is set, else the delivery
// to the channels at once.

declare(strict_types=1);

namespace Formgate\Delivery;

use Formgate\Alerts\Alerter;
use Formgate\Settings\Settings;
use Formgate\Storage\Storage;

final class DeliveryFactory
{
    public static function create(Settings $settings, Storage $storage, Alerter $alerter): Delivery
    {
        $file = TestDeliveryFile::path();
        return $file === null
            ? new ImmediateDelivery(new Dispatcher($settings), $storage, $alerter)
            : new TestDelivery($file, $settings, $storage);
    }
}
