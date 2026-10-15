<?php
// Finds the settings file and takes the first place that has it, in this order:
// 1. the FORMGATE_SETTINGS environment variable;
// 2. formgate.php above the site root, then above releases/ when the site is in releases/<id> (a deploy layout);
// 3. formgate.php inside the Lite folder, for hostings where nothing can go above the site root.
// A variable that is set names the file: if that file is missing, it is an error, not a reason to look further.

declare(strict_types=1);

namespace Formgate\Settings;

use RuntimeException;

final class SettingsLocator
{
    private const ENVIRONMENT_VARIABLE = 'FORMGATE_SETTINGS';
    private const FILE_NAME = 'formgate.php';

    public static function find(string $liteDirectory): string
    {
        $file = (string) getenv(self::ENVIRONMENT_VARIABLE);
        if ($file !== '') {
            return $file;
        }
        foreach (self::candidates($liteDirectory) as $file) {
            if (is_file($file)) {
                return $file;
            }
        }
        throw new RuntimeException('settings: no settings file found; set FORMGATE_SETTINGS or put formgate.php above the site root');
    }

    /** @return list<string> the places to look at, in order */
    private static function candidates(string $liteDirectory): array
    {
        $candidates = array_map(fn (string $folder): string => $folder . '/' . self::FILE_NAME, self::foldersAboveSite());
        return [...$candidates, $liteDirectory . '/' . self::FILE_NAME];
    }

    /** @return list<string> the folder above the site root and, for a site in releases/<id>, the one above releases/ */
    private static function foldersAboveSite(): array
    {
        $above = SiteRoot::above();
        if ($above === null) {
            return [];
        }
        return basename($above) === 'releases' ? [$above, dirname($above)] : [$above];
    }
}
