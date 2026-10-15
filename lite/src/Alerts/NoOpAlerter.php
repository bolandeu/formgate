<?php
// An alerter that sends nothing: the settings have no alert bot.

declare(strict_types=1);

namespace Formgate\Alerts;

use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;

final class NoOpAlerter implements Alerter
{
    public function alert(Request $request, DeliveryReport $report): void
    {
    }
}
