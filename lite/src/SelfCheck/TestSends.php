<?php
// The test sends of the self-check: one test message to each channel of the settings, and one per method for an
// email channel. The message says it is a test. It never goes to the storage, so it is never a stored request.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use DateTimeImmutable;
use Formgate\Channels\ChannelFactory;
use Formgate\Channels\ChannelResult;
use Formgate\Channels\Email\EmailMethod;
use Formgate\Intake\Request;
use Formgate\Intake\ServerData;
use Formgate\Intake\ServiceFields;
use Formgate\Routing\Router;
use Formgate\Settings\Settings;
use Throwable;

final class TestSends
{
    private const SUBJECT = 'TEST: Formgate self-check';

    /** @return list<Finding> */
    public static function collect(Settings $settings): array
    {
        $request = new Request(
            ['test' => 'This message is a test from the Formgate self-check. It is not a request.'],
            ServiceFields::fromValues(['__subject' => self::SUBJECT]),
            new DateTimeImmutable('now', $settings->timezone()),
            ServerData::empty(),
        );
        $findings = [];
        foreach ($settings->channels() as $index => $channel) {
            $name = Router::channelName($channel['type'], $index);
            foreach (self::variants($channel['type'], $channel['options']) as $suffix => $options) {
                $findings[] = self::send($name . $suffix, $channel['type'], $options, $request);
            }
        }
        return $findings;
    }

    /**
     * An email channel is tried once per method; any other channel once.
     *
     * @param array<string, mixed> $options
     * @return array<string, array<string, mixed>> label suffix => options of the channel to test
     */
    private static function variants(string $type, array $options): array
    {
        if ($type !== 'email' || !is_array($options['methods'] ?? null)) {
            return ['' => $options];
        }
        $variants = [];
        foreach ($options['methods'] as $method) {
            $variants[', ' . self::describe($method)] = ['methods' => [$method]] + $options;
        }
        return $variants;
    }

    private static function describe(mixed $method): string
    {
        try {
            return EmailMethod::fromOptions((array) $method)->describe();
        } catch (Throwable) {
            return 'invalid method';
        }
    }

    /** @param array<string, mixed> $options */
    private static function send(string $label, string $type, array $options, Request $request): Finding
    {
        try {
            $result = (new ChannelFactory())->create($type, $options)->send($request);
        } catch (Throwable $error) {
            $result = ChannelResult::failed($error->getMessage());
        }
        return $result->isDelivered ? Finding::ok($label, 'test message sent') : Finding::fail($label, $result->reason);
    }
}
