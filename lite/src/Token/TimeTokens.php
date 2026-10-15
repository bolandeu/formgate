<?php
// Time tokens (docs/integration.md, section 6): issues a token for GET ?token and names the spam reason of a post
// when the project has require_token on. A token is `<issue time>.<random id>.<signature>`: the signature is
// HMAC-SHA256 over the project, the issue time and the id, in base64url. The check of the signature and the age is
// stateless; the used ids stay in the duplicate store of the storage until the upper limit, so a replay is reused.
// With require_pow on, the answer carries an ALTCHA challenge of the token, and a post needs its solution (ProofOfWork).

declare(strict_types=1);

namespace Formgate\Token;

use DateTimeImmutable;
use Formgate\Clock;
use Formgate\Intake\Request;
use Formgate\Intake\ServiceFields;
use Formgate\Settings\Settings;
use Formgate\Spam\SpamReason;
use Formgate\Storage\Storage;

final class TimeTokens
{
    /** 128 bits: a random id never repeats within the upper limit. */
    private const ID_BYTES = 16;

    private readonly ProofOfWork $proofOfWork;

    /** @param string $project what the token belongs to, so a token of one project fails in another one */
    public function __construct(
        private readonly SigningKey $key,
        private readonly string $project,
        private readonly Settings $settings,
        private readonly Storage $storage,
    ) {
        $this->proofOfWork = new ProofOfWork($key, $settings);
    }

    /**
     * A new token and the lower limit that the client waits out; with require_pow on, also the challenge of the token.
     *
     * @return array{token: string, min_seconds: int, challenge?: array{algorithm: string, challenge: string, maxnumber: int, salt: string, signature: string}}
     */
    public function issue(): array
    {
        $issuedAt = Clock::now($this->settings->timezone())->getTimestamp();
        $id = self::base64url(random_bytes(self::ID_BYTES));
        $answer = [
            'token' => "{$issuedAt}.{$id}." . $this->signature((string) $issuedAt, $id),
            'min_seconds' => $this->settings->tokenMinSeconds(),
        ];
        return $this->settings->requiresPow()
            ? $answer + ['challenge' => $this->proofOfWork->challenge($id, $issuedAt + $this->settings->tokenMaxSeconds())]
            : $answer;
    }

    /** The token reason of the spam log, or null when the check is off or the token is valid. */
    public function spamReason(Request $request): ?SpamReason
    {
        if (!$this->settings->requiresToken()) {
            return null;
        }
        $service = $request->service;
        if ($service->token === '') {
            return $this->missingTokenReason($service);
        }
        $parts = explode('.', $service->token);
        if (count($parts) !== 3 || preg_match('/^\d+$/', $parts[0]) !== 1) {
            return SpamReason::BadSignature;
        }
        [$issuedAt, $id, $signature] = $parts;
        return $this->tokenProblem($issuedAt, $id, $signature, $request->receivedAt)
            ?? $this->powProblem($service->pow, $id, $request->receivedAt);
    }

    /**
     * A client that could not get a token says so; a form without the client sends neither the token nor __pow, so
     * with require_pow on it is pow_missing.
     */
    private function missingTokenReason(ServiceFields $service): SpamReason
    {
        return match (true) {
            $service->tokenUnavailable => SpamReason::TokenUnavailable,
            $this->settings->requiresPow() && $service->pow === '' => SpamReason::PowMissing,
            default => SpamReason::TokenMissing,
        };
    }

    private function tokenProblem(string $issuedAt, string $id, string $signature, DateTimeImmutable $at): ?SpamReason
    {
        $age = $at->getTimestamp() - (int) $issuedAt;
        return match (true) {
            !hash_equals($this->signature($issuedAt, $id), $signature) => SpamReason::BadSignature,
            $age < $this->settings->tokenMinSeconds() => SpamReason::TooFast,
            $age > $this->settings->tokenMaxSeconds() => SpamReason::Expired,
            $this->storage->isRepeated("token {$id}", $at, $this->settings->tokenMaxSeconds()) => SpamReason::Reused,
            default => null,
        };
    }

    /** The proof-of-work reason of a request whose token (with the id $tokenId) is valid. */
    private function powProblem(string $pow, string $tokenId, DateTimeImmutable $at): ?SpamReason
    {
        return $this->settings->requiresPow() ? $this->proofOfWork->spamReason($pow, $tokenId, $at) : null;
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
