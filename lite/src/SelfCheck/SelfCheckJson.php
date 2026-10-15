<?php
// The self-check as JSON for a check after a publish: where the settings were found, the domains, the channels (and
// whether their required options are set), the storage, the time token check, the test delivery and the findings. It
// has no secret of the settings (key, tokens, passwords, webhooks) and sends no test message.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Channels\ChannelFactory;
use Formgate\Delivery\TestDeliveryFile;
use Formgate\Response\Response;
use Formgate\Settings\Settings;
use Formgate\Settings\SettingsLocator;
use Formgate\Storage\Storage;
use Formgate\Storage\StoragePlace;
use Formgate\Token\SigningKey;
use RuntimeException;

final class SelfCheckJson
{
    /** @param list<Finding> $findings */
    public static function response(Settings $settings, Storage $storage, SigningKey $signingKey, array $findings): Response
    {
        return Response::json(200, [
            'settings' => ['found' => true, 'where' => SettingsLocator::where($settings->file())],
            'domains' => $settings->domains(),
            'channels' => self::channels($settings),
            'storage' => ['backend' => $storage->kind(), 'writable' => StoragePlace::find()->isWritable()],
            'token' => [
                'required' => $settings->requiresToken(),
                'key_present' => $signingKey->exists(),
                'min_seconds' => $settings->tokenMinSeconds(),
                'max_seconds' => $settings->tokenMaxSeconds(),
                'pow_required' => $settings->requiresPow(),
                'pow_max_number' => $settings->powMaxNumber(),
            ],
            'test_delivery' => TestDeliveryFile::path() !== null,
            'findings' => array_map(
                fn (Finding $finding): array => ['label' => $finding->label, 'level' => $finding->level, 'detail' => $finding->detail],
                $findings,
            ),
        ])->withHeaders(['Cache-Control' => 'no-store', 'X-Robots-Tag' => 'noindex']);
    }

    /** @return list<array{number: int, type: string, name: string|null, configured: bool}> */
    private static function channels(Settings $settings): array
    {
        $channels = [];
        foreach ($settings->channels() as $index => $channel) {
            $channels[] = [
                'number' => $index + 1,
                'type' => $channel['type'],
                'name' => $channel['name'],
                'configured' => self::isConfigured($channel['type'], $channel['options']),
            ];
        }
        return $channels;
    }

    /**
     * A channel is made from its options only when the required options are there.
     *
     * @param array<string, mixed> $options
     */
    private static function isConfigured(string $type, array $options): bool
    {
        try {
            (new ChannelFactory())->create($type, $options);
            return true;
        } catch (RuntimeException) {
            return false;
        }
    }
}
