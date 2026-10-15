<?php
// The reasons of the spam log: why the spam filter took a request for a bot or a duplicate. The token reasons come
// from the time token check and its proof-of-work (docs/integration.md, section 6).

declare(strict_types=1);

namespace Formgate\Spam;

enum SpamReason: string
{
    case Honeypot = 'honeypot';
    case EmptyUserAgent = 'empty_user_agent';
    case RateLimit = 'rate_limit';
    case Duplicate = 'duplicate';
    case TokenMissing = 'token_missing';
    case TokenUnavailable = 'token_unavailable';
    case TooFast = 'too_fast';
    case Expired = 'expired';
    case BadSignature = 'bad_signature';
    case Reused = 'reused';
    case PowMissing = 'pow_missing';
    case PowInvalid = 'pow_invalid';

    /** True for the reasons of the time token check: the visitor may be a person, so the operator may release it. */
    public function isTokenReason(): bool
    {
        return match ($this) {
            self::TokenMissing, self::TokenUnavailable, self::TooFast, self::Expired, self::BadSignature, self::Reused,
            self::PowMissing, self::PowInvalid => true,
            self::Honeypot, self::EmptyUserAgent, self::RateLimit, self::Duplicate => false,
        };
    }
}
