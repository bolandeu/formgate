<?php
// Chooses the alerter for the settings. The entry script calls it, so a new alerter changes only this module.
// Without an alert bot in the settings the operator gets no alerts.

declare(strict_types=1);

namespace Formgate\Alerts;

use Formgate\Settings\Settings;

final class AlerterFactory
{
    public static function create(Settings $settings): Alerter
    {
        $options = $settings->alert();
        return $options === null ? new NoOpAlerter() : new TelegramAlerter($settings->projectName(), $options);
    }
}
