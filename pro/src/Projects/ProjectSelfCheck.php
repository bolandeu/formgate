<?php
// The self-check of a Pro project: the time token check (with the check on, the signing key must be there) and each
// channel of the project are ok or fail with the reason. Without a test send it builds each channel from its
// settings (a missing option fails); with a test send it also sends the Lite self-check test message through each
// channel. The reasons come without any secret of the settings.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

use Formgate\Channels\ChannelFactory;
use Formgate\Routing\Router;
use Formgate\SelfCheck\Finding;
use Formgate\SelfCheck\TestSends;
use Formgate\Settings\Settings;
use Formgate\Token\SigningKey;
use Throwable;

final class ProjectSelfCheck
{
    /**
     * @return list<Finding> the time token finding when the project has the check on, then one finding per channel; a
     *                       test send gives one per email method
     */
    public static function run(Settings $settings, SigningKey $signingKey, bool $testSend): array
    {
        $channels = $testSend ? TestSends::collect($settings) : self::configured($settings);
        return $settings->requiresToken() ? [self::tokenCheck($signingKey), ...$channels] : $channels;
    }

    private static function tokenCheck(SigningKey $signingKey): Finding
    {
        return $signingKey->exists()
            ? Finding::ok('Time token', 'check on, signing key present')
            : Finding::fail('Time token', 'check on, but FORMGATE_TOKEN_SECRET is not set: token requests answer server_error');
    }

    /** @return list<Finding> */
    private static function configured(Settings $settings): array
    {
        $findings = [];
        foreach ($settings->channels() as $index => $channel) {
            $name = Router::channelName($channel['type'], $index);
            try {
                (new ChannelFactory())->create($channel['type'], $channel['options']);
                $findings[] = Finding::ok($name, 'configured');
            } catch (Throwable $error) {
                $findings[] = Finding::fail($name, $error->getMessage());
            }
        }
        return $findings;
    }
}
