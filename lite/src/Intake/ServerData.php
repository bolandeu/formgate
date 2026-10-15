<?php
// The server data of a request: what the server saw, not what the visitor typed. A random request id, the visitor IP
// (VisitorIp, the rule of the rate limit), the User-Agent header cut to a length limit and the host of Origin, else of
// Referer. A request stored before the server data existed has them all empty. Channels never get this data.

declare(strict_types=1);

namespace Formgate\Intake;

use Formgate\Spam\VisitorIp;

final class ServerData
{
    /** The names of the stored values, in the order of values(). */
    public const NAMES = ['request_id', 'ip', 'user_agent', 'origin_host'];

    private const USER_AGENT_LENGTH = 512;
    private const ID_BYTES = 16;

    public function __construct(
        public readonly string $requestId,
        public readonly string $ip,
        public readonly string $userAgent,
        public readonly string $originHost,
    ) {
    }

    public static function fromHttp(HttpRequest $http, VisitorIp $visitorIp): self
    {
        return new self(
            rtrim(strtr(base64_encode(random_bytes(self::ID_BYTES)), '+/', '-_'), '='),
            $visitorIp->of($http),
            mb_substr($http->header('user-agent'), 0, self::USER_AGENT_LENGTH),
            strtolower((string) parse_url($http->source(), PHP_URL_HOST)),
        );
    }

    /** The data of a request made without a visitor (the self-check) or stored before the server data existed. */
    public static function empty(): self
    {
        return new self('', '', '', '');
    }

    /** @param array<string, string> $values the values of values() */
    public static function fromValues(array $values): self
    {
        return new self(...array_map(fn (string $name): string => $values[$name] ?? '', self::NAMES));
    }

    /** @return array<string, string> name => value, for a stored record */
    public function values(): array
    {
        return array_combine(self::NAMES, [$this->requestId, $this->ip, $this->userAgent, $this->originHost]);
    }
}
