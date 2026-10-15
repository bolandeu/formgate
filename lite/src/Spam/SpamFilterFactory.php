<?php
// Chooses the spam filter for the settings; the filter gets the storage for rate counters and duplicates, and the
// time tokens of the project. The entry script calls it, so a new filter changes only this module.

declare(strict_types=1);

namespace Formgate\Spam;

use Formgate\Settings\Settings;
use Formgate\Storage\Storage;
use Formgate\Token\TimeTokens;

final class SpamFilterFactory
{
    public static function create(Settings $settings, Storage $storage, TimeTokens $timeTokens): SpamFilter
    {
        return new RuleSpamFilter($settings, $storage, $timeTokens);
    }
}
