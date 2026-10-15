<?php
// Routing: chooses the route of a request. The first special case of the settings that matches the request gives its
// channels; when none matches, the request takes the default route: every channel of the settings. The channels keep
// their order in the settings. The required fields of the route join those of the project, of the case and of
// __required, so a form can only add to them.

declare(strict_types=1);

namespace Formgate\Routing;

use Formgate\Channels\Channel;
use Formgate\Channels\ChannelFactory;
use Formgate\Intake\Request;
use Formgate\Settings\Settings;

final class Router
{
    public function __construct(private readonly Settings $settings, private readonly ChannelFactory $channels)
    {
    }

    /** The channel name for reports and logs: the type and the place in the settings, `telegram #1`. */
    public static function channelName(string $type, int $index): string
    {
        return "{$type} #" . ($index + 1);
    }

    public function route(Request $request): Route
    {
        $case = null;
        foreach ($this->settings->cases() as $candidate) {
            if ($candidate->matches($request)) {
                $case = $candidate;
                break;
            }
        }
        $required = [...$this->settings->requiredFields(), ...($case->required ?? []), ...$request->service->required];
        return new Route($case, array_values(array_unique($required)));
    }

    /** @return array<string, Channel> channel name (`telegram #1`: type and place in the settings) => channel */
    public function channelsFor(Request $request): array
    {
        $route = $this->route($request);
        $channels = [];
        foreach ($this->settings->channels() as $index => $channel) {
            if ($route->hasChannel($index)) {
                $channels[self::channelName($channel['type'], $index)] = $this->channels->create($channel['type'], $channel['options']);
            }
        }
        return $channels;
    }
}
