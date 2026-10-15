<?php
// Sends a request to each channel of its route and collects the results. Lite calls it inside the request; the Pro
// worker calls it for each queued request.

declare(strict_types=1);

namespace Formgate\Delivery;

use Formgate\Channels\ChannelFactory;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Routing\Router;
use Formgate\Settings\Settings;

final class Dispatcher
{
    private readonly Router $router;

    public function __construct(Settings $settings)
    {
        $this->router = new Router($settings, new ChannelFactory());
    }

    public function dispatch(Request $request): DeliveryReport
    {
        $report = new DeliveryReport();
        foreach ($this->router->channelsFor($request) as $name => $channel) {
            $report->add($name, $channel->send($request));
        }
        return $report;
    }
}
