<?php
// The storage place of Lite: the folder above the site root when the site root is known and that folder is writable;
// else the Lite folder, where every file is guarded: a .php file whose first line stops PHP, so a GET of it shows no
// data. The storage and the signing key of time tokens live here. The site root is the web server's document root,
// where the site lives, not the Lite subfolder.
// FORMGATE_TEST_ABOVE_NOT_WRITABLE is test-only: only the Lite tests set it, for tests that run as root, where chmod
// does not stop writing. The place then treats the folder above the site root as not writable.

declare(strict_types=1);

namespace Formgate\Storage;

use Formgate\Settings\SiteRoot;

final class StoragePlace
{
    /** The first line of a guarded file: PHP stops there, so a GET of the file shows no data. */
    private const GUARD = "<?php exit; ?>\n";

    private function __construct(public readonly string $directory, public readonly bool $isGuarded)
    {
    }

    public static function find(): self
    {
        $above = SiteRoot::above();
        $isWritable = $above !== null && getenv('FORMGATE_TEST_ABOVE_NOT_WRITABLE') === false && is_writable($above);
        return $isWritable ? new self($above, false) : new self(dirname(__DIR__, 2), true);
    }

    /** True when Lite can write in the folder of the storage. */
    public function isWritable(): bool
    {
        return is_writable($this->directory);
    }

    /** The file formgate-<name> of the place: a plain .jsonl file above the site root, a guarded .php file else. */
    public function jsonlFile(string $name): JsonlFile
    {
        return $this->isGuarded
            ? new JsonlFile("{$this->directory}/formgate-{$name}.php", self::GUARD)
            : new JsonlFile("{$this->directory}/formgate-{$name}.jsonl", '');
    }
}
