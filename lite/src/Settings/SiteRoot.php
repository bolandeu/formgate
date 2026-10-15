<?php
// The site root: the web server's document root, where the site lives. It is not the Lite subfolder, so the places
// "above the site root" are the same wherever the operator puts the Lite folder.

declare(strict_types=1);

namespace Formgate\Settings;

final class SiteRoot
{
    /** The document root without a trailing slash, or an empty text when the web server does not tell it. */
    public static function path(): string
    {
        return rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
    }

    /** The folder above the site root, or null when the site root is unknown. */
    public static function above(): ?string
    {
        $path = self::path();
        return $path === '' ? null : dirname($path);
    }

    /** True when the file is inside the site root, so a web server could serve it. */
    public static function contains(string $file): bool
    {
        $root = realpath(self::path());
        $real = realpath($file);
        return $root !== false && $real !== false && str_starts_with($real, $root . '/');
    }
}
