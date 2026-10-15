<?php
// Chooses the self-check for the settings. The entry script calls it, so a new self-check changes only this module.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Settings\Settings;
use Formgate\Storage\Storage;
use Formgate\Token\SigningKey;

final class SelfCheckFactory
{
    public static function create(Settings $settings, Storage $storage, SigningKey $signingKey): SelfCheck
    {
        return new KeyedSelfCheck($settings, $storage, $signingKey);
    }
}
