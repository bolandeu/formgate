<?php
// The check of the receiver address of a channel that sends to a URL of the settings (the webhook channel). Pro has
// one, the private-address guard; Lite has none. The channel connects only to the address that the guard gives, so
// a DNS answer that changes between the check and the connection cannot send the request elsewhere.

declare(strict_types=1);

namespace Formgate\Channels;

interface AddressGuard
{
    /** The checked address to connect to for the host; a refused host throws a RuntimeException that names it. */
    public function addressOf(string $host): string;
}
