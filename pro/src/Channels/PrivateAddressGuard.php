<?php
// The private-address guard of Pro: the receiver host of a webhook channel must resolve to public addresses only.
// The host is resolved once; a loopback, private (RFC 1918, fc00::/7), link-local, unspecified or other non-public
// address refuses it with a message that names the host. The webhook channel then connects only to the checked address.
// FORMGATE_WEBHOOK_ALLOW_PRIVATE turns the guard off for a receiver on this server or on a private network.

declare(strict_types=1);

namespace Formgate\Pro\Channels;

use Formgate\Channels\AddressGuard;
use Formgate\Pro\Config\ProConfig;
use RuntimeException;

final class PrivateAddressGuard implements AddressGuard
{
    /** The guard, or null when FORMGATE_WEBHOOK_ALLOW_PRIVATE turns it off. */
    public static function fromConfig(ProConfig $config): ?self
    {
        return $config->webhookAllowPrivate() ? null : new self();
    }

    public function addressOf(string $host): string
    {
        $addresses = filter_var($host, FILTER_VALIDATE_IP) !== false ? [$host] : (gethostbynamel($host) ?: []);
        if ($addresses === []) {
            throw new RuntimeException("the url host {$host} does not resolve to an address");
        }
        foreach ($addresses as $address) {
            if (!self::isPublic($address)) {
                throw new RuntimeException("the url host {$host} resolves to {$address}, not a public address;"
                    . ' set FORMGATE_WEBHOOK_ALLOW_PRIVATE for a receiver on this server or a private network');
            }
        }
        return $addresses[0];
    }

    private static function isPublic(string $address): bool
    {
        // FILTER_FLAG_GLOBAL_RANGE (PHP 8.2) also refuses the shared and documentation ranges; PHP 8.1 lacks it.
        $globalRange = defined('FILTER_FLAG_GLOBAL_RANGE') ? (int) constant('FILTER_FLAG_GLOBAL_RANGE') : 0;
        return filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE | $globalRange) !== false;
    }
}
