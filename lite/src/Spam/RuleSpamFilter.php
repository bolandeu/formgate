<?php
// The Lite spam filter. In this order: a filled honeypot field, an empty User-Agent, the time token check (when the
// project has it on), more requests from one visitor IP to one form than the rate limit allows, the same fields for
// the same form within the duplicate window. A request of a person goes on without the honeypot field.

declare(strict_types=1);

namespace Formgate\Spam;

use Formgate\Intake\HttpRequest;
use Formgate\Intake\Request;
use Formgate\Settings\Settings;
use Formgate\Storage\Records;
use Formgate\Storage\Storage;
use Formgate\Token\TimeTokens;

final class RuleSpamFilter implements SpamFilter
{
    public function __construct(
        private readonly Settings $settings,
        private readonly Storage $storage,
        private readonly TimeTokens $timeTokens,
    ) {
    }

    public function spamReason(Request $request, HttpRequest $http): ?SpamReason
    {
        return match (true) {
            $request->field($this->settings->honeypotField()) !== '' => SpamReason::Honeypot,
            trim($http->header('user-agent')) === '' => SpamReason::EmptyUserAgent,
            default => $this->timeTokens->spamReason($request) ?? $this->repeatedReason($request),
        };
    }

    /** The request without the honeypot field: an empty one is no data of the visitor. */
    public function withoutTraps(Request $request): Request
    {
        return $request->without($this->settings->honeypotField());
    }

    /** The reason of a request that comes too often: over the rate limit or a duplicate. */
    private function repeatedReason(Request $request): ?SpamReason
    {
        return match (true) {
            $this->isOverRateLimit($request) => SpamReason::RateLimit,
            $this->isDuplicate($request) => SpamReason::Duplicate,
            default => null,
        };
    }

    private function isOverRateLimit(Request $request): bool
    {
        $key = $request->server->ip . ' ' . $request->service->form;
        $hits = $this->storage->countHit($key, $request->receivedAt, $this->settings->rateLimitWindowSeconds());
        return $hits > $this->settings->rateLimitRequests();
    }

    private function isDuplicate(Request $request): bool
    {
        $window = $this->settings->duplicateWindowSeconds();
        return $this->storage->isRepeated(self::fingerprint($request), $request->receivedAt, $window);
    }

    /** The hash of the form name and the fields in name order, each value without spaces and in lower case. */
    private static function fingerprint(Request $request): string
    {
        $fields = array_map(
            fn (string $value): string => mb_strtolower(preg_replace('/\s+/u', '', $value) ?? $value),
            $request->fields,
        );
        ksort($fields);
        return hash('sha256', Records::json([$request->service->form, $fields]));
    }
}
