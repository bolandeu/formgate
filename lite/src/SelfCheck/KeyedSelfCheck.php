<?php
// The self-check: a GET on the Lite entry with the secret key of the settings (`?key=…`) shows the setup (the time
// token check included) and sends one test message per channel. A GET that accepts application/json gets the setup as
// JSON and sends no test message. A GET with no `key` parameter is not a self-check: the kernel answers 405, as to any
// non-POST. A wrong or empty key, or settings without a key, get 404 with an empty body, so the page shows nothing
// to a stranger.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Intake\HttpRequest;
use Formgate\Response\Response;
use Formgate\Settings\Settings;
use Formgate\Storage\Storage;
use Formgate\Token\SigningKey;

final class KeyedSelfCheck implements SelfCheck
{
    public function __construct(
        private readonly Settings $settings,
        private readonly Storage $storage,
        private readonly SigningKey $signingKey,
    ) {
    }

    public function answer(HttpRequest $http): ?Response
    {
        if (!array_key_exists('key', $http->query)) {
            return null;
        }
        $expected = $this->settings->selfCheckKey();
        $given = $http->query['key'];
        if ($expected === null || !is_string($given) || !hash_equals($expected, $given)) {
            return new Response(404);
        }
        $findings = [
            ...EnvironmentFindings::collect($this->settings, $this->storage),
            TokenFinding::of($this->settings, $this->signingKey),
            TestDeliveryFinding::of(),
        ];
        return $http->acceptsJson()
            ? SelfCheckJson::response($this->settings, $this->storage, $this->signingKey, $findings)
            : SelfCheckPage::response([...$findings, ...TestSends::collect($this->settings)]);
    }
}
