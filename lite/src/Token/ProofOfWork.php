<?php
// ALTCHA proof-of-work (docs/integration.md, section 6) by the library altcha-org/altcha, protocol version 1, which the
// widget and altcha-lib solve. The challenge is HMAC-signed with the signing key of the time token. Its salt carries
// the id of the token and the upper limit of the token age, so a solution fits one token and goes stale with it.

declare(strict_types=1);

namespace Formgate\Token;

use AltchaOrg\Altcha\V1\Altcha;
use AltchaOrg\Altcha\V1\ChallengeOptions;
use DateTimeImmutable;
use Formgate\Settings\Settings;
use Formgate\Spam\SpamReason;

final class ProofOfWork
{
    public function __construct(private readonly SigningKey $key, private readonly Settings $settings)
    {
    }

    /**
     * @param int $expiresAt the time (Unix seconds) after which the token is expired
     * @return array{algorithm: string, challenge: string, maxnumber: int, salt: string, signature: string}
     */
    public function challenge(string $tokenId, int $expiresAt): array
    {
        $challenge = $this->altcha()->createChallenge(
            new ChallengeOptions(maxNumber: $this->settings->powMaxNumber(), params: ['tid' => $tokenId, 'exp' => $expiresAt]),
        );
        return [
            'algorithm' => $challenge->algorithm,
            'challenge' => $challenge->challenge,
            'maxnumber' => $challenge->maxNumber,
            'salt' => $challenge->salt,
            'signature' => $challenge->signature,
        ];
    }

    /** The reason of the spam log when the payload is missing, wrong, of another token or expired; else null. */
    public function spamReason(string $payload, string $tokenId, DateTimeImmutable $at): ?SpamReason
    {
        if ($payload === '') {
            return SpamReason::PowMissing;
        }
        // The library checks the expiry by the real clock, so its check is off: the expiry is checked here.
        if (!$this->altcha()->verifySolution($payload, false)) {
            return SpamReason::PowInvalid;
        }
        $params = self::saltParams($payload);
        return $params['tid'] === $tokenId && (int) $params['exp'] >= $at->getTimestamp() ? null : SpamReason::PowInvalid;
    }

    private function altcha(): Altcha
    {
        return new Altcha($this->key->secret());
    }

    /**
     * The parameters in the salt of a payload that the library has verified.
     *
     * @return array{tid: string, exp: string}
     */
    private static function saltParams(string $payload): array
    {
        $decoded = json_decode((string) base64_decode($payload, true), true);
        parse_str(explode('?', (string) ($decoded['salt'] ?? ''), 2)[1] ?? '', $params);
        return ['tid' => (string) ($params['tid'] ?? ''), 'exp' => (string) ($params['exp'] ?? '')];
    }
}
