<?php
// The finding about the time token check: on or off, the signing key there or not, the limits of the token age and the proof-of-work.
// It never shows the key. With the check on and no key yet it warns: the first token request makes the key.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Settings\Settings;
use Formgate\Token\SigningKey;

final class TokenFinding
{
    private const LABEL = 'Time token';

    public static function of(Settings $settings, SigningKey $key): Finding
    {
        $detail = sprintf(
            'check %s, signing key %s, token age from %d s to %d s, proof-of-work %s (max number %d)',
            $settings->requiresToken() ? 'on' : 'off',
            $key->exists() ? 'present' : 'missing (the first token request makes it)',
            $settings->tokenMinSeconds(),
            $settings->tokenMaxSeconds(),
            $settings->requiresPow() ? 'on' : 'off',
            $settings->powMaxNumber(),
        );
        return $settings->requiresToken() && !$key->exists()
            ? Finding::warning(self::LABEL, $detail)
            : Finding::ok(self::LABEL, $detail);
    }
}
