<?php
// The findings about the server and the setup: the PHP version, the HTTP client for channels, mbstring,
// pdo_sqlite, the settings file and the storage.

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Settings\Settings;
use Formgate\Settings\SiteRoot;
use Formgate\Storage\Storage;

final class EnvironmentFindings
{
    private const MINIMUM_PHP = '8.1.0';

    /** @return list<Finding> */
    public static function collect(Settings $settings, Storage $storage): array
    {
        return [
            self::phpVersion(),
            self::httpClient(),
            self::extension('mbstring', 'needed for the field checks'),
            self::sqlite(),
            self::settingsFile($settings->file()),
            Finding::ok('Storage', $storage->kind()),
        ];
    }

    private static function phpVersion(): Finding
    {
        return version_compare(PHP_VERSION, self::MINIMUM_PHP, '>=')
            ? Finding::ok('PHP version', PHP_VERSION)
            : Finding::fail('PHP version', PHP_VERSION . ', Lite needs PHP ' . self::MINIMUM_PHP . ' or newer');
    }

    /** Channels use curl and fall back to PHP streams (allow_url_fopen), as Http does. */
    private static function httpClient(): Finding
    {
        if (function_exists('curl_init')) {
            return Finding::ok('HTTP client', 'curl');
        }
        return ini_get('allow_url_fopen')
            ? Finding::ok('HTTP client', 'allow_url_fopen (curl is not loaded)')
            : Finding::fail('HTTP client', 'neither curl nor allow_url_fopen: Telegram and Bitrix24 cannot be reached');
    }

    private static function extension(string $name, string $why): Finding
    {
        return extension_loaded($name) ? Finding::ok($name, 'loaded') : Finding::fail($name, "not loaded, {$why}");
    }

    private static function sqlite(): Finding
    {
        return extension_loaded('pdo_sqlite')
            ? Finding::ok('pdo_sqlite', 'loaded')
            : Finding::warning('pdo_sqlite', 'not loaded: requests go to JSONL files');
    }

    private static function settingsFile(string $file): Finding
    {
        return SiteRoot::contains($file)
            ? Finding::warning('Settings file', "{$file} is inside the web root: less safe, move it above the site root")
            : Finding::ok('Settings file', $file);
    }
}
