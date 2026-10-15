<?php
// Project domains: a request must come from a project domain (Origin, or Referer when Origin is missing),
// and only a project domain gets CORS headers and a preflight answer.

declare(strict_types=1);

namespace Formgate\Checks;

use Formgate\Intake\HttpRequest;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;
use Formgate\Response\Response;

final class Origin
{
    /** @param list<string> $domains */
    public function __construct(private readonly array $domains)
    {
    }

    public function check(HttpRequest $http): void
    {
        if (!$this->isProjectUrl($http->source())) {
            throw new Rejection(ErrorCode::OriginNotAllowed);
        }
    }

    /** True for an http(s) URL whose host is a project domain. */
    public function isProjectUrl(string $url): bool
    {
        $parts = parse_url($url);
        return is_array($parts)
            && in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
            && in_array(strtolower($parts['host'] ?? ''), array_map('strtolower', $this->domains), true);
    }

    /** @return array<string, string> the CORS headers for a request from a project domain, else none */
    public function corsHeaders(HttpRequest $http): array
    {
        $origin = $http->header('origin');
        return $this->isProjectUrl($origin) ? ['Access-Control-Allow-Origin' => $origin, 'Vary' => 'Origin'] : [];
    }

    /** The answer to a CORS preflight (OPTIONS); the kernel adds the CORS headers for a project domain. */
    public function preflight(HttpRequest $http): Response
    {
        $allowed = $this->corsHeaders($http) === [] ? [] : [
            'Access-Control-Allow-Methods' => 'POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, Accept',
        ];
        return new Response(204, $allowed);
    }
}
