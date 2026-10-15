<?php
// The Lite delivery: sends the request to its channels inside the HTTP request, stores it with its route and the
// delivery report, alerts the operator about failed channels and refuses with delivery_failed when no channel delivered it.

declare(strict_types=1);

namespace Formgate\Delivery;

use Formgate\Alerts\Alerter;
use Formgate\Intake\Request;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;
use Formgate\Routing\Route;
use Formgate\Storage\Storage;

final class ImmediateDelivery implements Delivery
{
    public function __construct(
        private readonly Dispatcher $dispatcher,
        private readonly Storage $storage,
        private readonly Alerter $alerter,
    ) {
    }

    public function deliver(Request $request, Route $route): void
    {
        $report = $this->dispatcher->dispatch($request);
        $this->storage->saveRequest($request, $route, $report);
        if ($report->failures() !== []) {
            foreach ($report->failures() as $name => $reason) {
                error_log("formgate: channel {$name} failed: {$reason}");
            }
            $this->alerter->alert($request, $report);
        }
        if (!$report->isAnyDelivered()) {
            throw new Rejection(ErrorCode::DeliveryFailed);
        }
    }
}
