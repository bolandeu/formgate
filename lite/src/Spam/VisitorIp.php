<?php
// The visitor IP for the rate limit: the direct peer, or the client named in X-Forwarded-For when the peer is a
// trusted proxy of the settings. A header from any other peer is ignored, so a bot cannot forge its IP.

declare(strict_types=1);

namespace Formgate\Spam;

use Formgate\Intake\HttpRequest;

final class VisitorIp
{
    /** @param list<string> $trustedProxies */
    public function __construct(private readonly array $trustedProxies)
    {
    }

    /** Walks X-Forwarded-For from the right, past trusted proxies, to the first address that is not one. */
    public function of(HttpRequest $http): string
    {
        $chain = array_filter(array_map('trim', explode(',', $http->header('x-forwarded-for'))));
        $address = $http->peerAddress;
        while ($chain !== [] && in_array($address, $this->trustedProxies, true)) {
            $address = array_pop($chain);
        }
        return $address;
    }
}
