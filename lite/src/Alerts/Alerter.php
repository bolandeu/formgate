<?php
// The alerter interface: tells the operator that a channel failed to deliver a request.

declare(strict_types=1);

namespace Formgate\Alerts;

use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;

interface Alerter
{
    public function alert(Request $request, DeliveryReport $report): void;
}
