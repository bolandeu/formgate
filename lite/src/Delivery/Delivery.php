<?php
// The delivery interface: what the kernel does with a checked request of a person and its route. Lite sends it to the
// channels at once (ImmediateDelivery); Pro stores it in its queue for the worker. Both keep the route with the request.
// A refusal throws a Rejection.

declare(strict_types=1);

namespace Formgate\Delivery;

use Formgate\Intake\Request;
use Formgate\Routing\Route;

interface Delivery
{
    public function deliver(Request $request, Route $route): void;
}
