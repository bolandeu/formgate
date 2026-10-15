<?php
// Chooses the storage at runtime in the storage place: SQLite above the site root when pdo_sqlite is loaded; else
// JSONL files there; else guarded JSONL files in the Lite folder.
// Two environment variables are test-only: only the Lite tests set them, an operator never does.
// - FORMGATE_TEST_WITHOUT_SQLITE: the factory treats pdo_sqlite as not loaded (read here, in hasSqlite).
// - FORMGATE_TEST_NOW: the time of the request, which moves the clock of retention, rate and duplicate windows
//   and of time tokens (read in Clock::now).

declare(strict_types=1);

namespace Formgate\Storage;

use Formgate\Settings\Settings;

final class StorageFactory
{
    public static function create(Settings $settings): Storage
    {
        $retention = new Retention($settings->retentionDays());
        $place = StoragePlace::find();
        if (!$place->isGuarded && self::hasSqlite()) {
            return new SqliteStorage("{$place->directory}/formgate.sqlite", $settings->sqliteBusyTimeoutSeconds(), $retention);
        }
        return new JsonlStorage($place, $retention);
    }

    /** pdo_sqlite is loaded and FORMGATE_TEST_WITHOUT_SQLITE does not hide it. */
    private static function hasSqlite(): bool
    {
        return extension_loaded('pdo_sqlite') && getenv('FORMGATE_TEST_WITHOUT_SQLITE') === false;
    }
}
