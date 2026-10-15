<?php
// The Pro delivery: stores the checked request of a project with its route in the queue, so the kernel answers "sent" at once
// (ADR 0002). The worker sends it to the channels later.

declare(strict_types=1);

namespace Formgate\Pro\Queue;

use Formgate\Delivery\Delivery;
use Formgate\Intake\Request;
use Formgate\Routing\Route;

final class QueueDelivery implements Delivery
{
    public function __construct(private readonly Queue $queue, private readonly string $projectKey)
    {
    }

    public function deliver(Request $request, Route $route): void
    {
        $this->queue->add($this->projectKey, $request, $route);
    }
}
