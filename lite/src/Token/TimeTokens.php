<?php
// Time tokens (docs/integration.md, section 6): issues a token for GET ?token and names the spam reason of a post
// when the project has require_token on. A token is `<issue time>.<random id>.<signature>`: the signature is
// HMAC-SHA256 over the project, the issue time and the id, in base64url. The check of the signature and the age is
// stateless; the used ids stay in the duplicate store of the storage until the upper limit, so a replay is reused.

declare(strict_types=1);

namespace Formgate\Token;

use DateTimeImmutable;
use Formgate\Clock;
use Formgate\Intake\Request;
use Formgate\Settings\Settings;
use Formgate\Spam\SpamReason;
use Formgate\Storage\Storage;

final class TimeTokens
{
    /** 128 bits: a random id never repeats within the upper limit. */
    private const ID_BYTES = 16;

    /** @param string $project what the token belongs to, so a token of one project fails in another one */
    public function __construct(
        private readonly SigningKey $key,
        private readonly string $project,
        private readonly Settings $settings,
        private readonly Storage $storage,
    ) {
    }

    /** @return array{token: string, min_seconds: int} a new token and the lower limit that the client waits out */
    public function issue(): array
    {
        $issuedAt = (string) Clock::now($this->settings->timezone())->getTimestamp();
        $id = self::base64url(random_bytes(self::ID_BYTES));
        return [
            'token' => "{$issuedAt}.{$id}." . $this->signature($issuedAt, $id),
            'min_seconds' => $this->settings->tokenMinSeconds(),
        ];
    }

    /** The token reason of the spam log, or null when the check is off or the token is valid. */
    public function spamReason(Request $request): ?SpamReason
    {
        if (!$this->settings->requiresToken()) {
            return null;
        }
        if ($request->service->token === '') {
            return $request->service->tokenUnavailable ? SpamReason::TokenUnavailable : SpamReason::TokenMissing;
        }
        return $this->tokenProblem($request->service->token, $request->receivedAt);
    }

    private function tokenProblem(string $token, DateTimeImmutable $at): ?SpamReason
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3 || preg_match('/^\d+$/', $parts[0]) !== 1) {
            return SpamReason::BadSignature;
        }
        [$issuedAt, $id, $signature] = $parts;
        $age = $at->getTimestamp() - (int) $issuedAt;
        return match (true) {
            !hash_equals($this->signature($issuedAt, $id), $signature) => SpamReason::BadSignature,
            $age < $this->settings->tokenMinSeconds() => SpamReason::TooFast,
            $age > $this->settings->tokenMaxSeconds() => SpamReason::Expired,
            $this->storage->isRepeated("token {$id}", $at, $this->settings->tokenMaxSeconds()) => SpamReason::Reused,
            default => null,
        };
    }

    private function signature(string $issuedAt, string $id): string
    {
        return self::base64url(hash_hmac('sha256', "{$this->project}\n{$issuedAt}\n{$id}", $this->key->secret(), true));
    }

    private static function base64url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
