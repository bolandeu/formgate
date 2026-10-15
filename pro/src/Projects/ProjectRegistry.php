<?php
// The project registry: the one module of Pro that reads and writes the project settings files, <projects>/<key>.php
// in the Lite settings format. Every write goes through one lock; the new settings are written to a temporary file,
// checked by the Lite validator, and only then renamed over the project file, so a reader never sees half a file,
// two writers never mix, and a refused change leaves the old file as it was. A key of another shape than a project
// key has no project. A project that the admin API makes holds the external id of the tool (`project.external_id`),
// unique in the registry; a CLI project has none.

declare(strict_types=1);

namespace Formgate\Pro\Projects;

use Formgate\Settings\Settings;
use RuntimeException;
use Symfony\Component\Filesystem\Filesystem;

final class ProjectRegistry
{
    /** A project key: 16 latin letters and digits. */
    private const KEY_LENGTH = 16;
    private const KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    private const LOCK_FILE = '.registry.lock';

    private readonly string $projectsDir;
    private readonly Filesystem $files;

    public function __construct(string $projectsDir)
    {
        $this->projectsDir = rtrim($projectsDir, '/');
        $this->files = new Filesystem();
    }

    /** The settings of the project, or null when the key has no project file. An invalid file throws. */
    public function find(string $key): ?Settings
    {
        return $this->exists($key) ? Settings::fromFile($this->fileOf($key)) : null;
    }

    /** @return list<string> the keys of all projects, in alphabetical order */
    public function keys(): array
    {
        $keys = [];
        foreach (glob($this->projectsDir . '/*.php') ?: [] as $file) {
            $key = basename($file, '.php');
            if (self::isKey($key)) {
                $keys[] = $key;
            }
        }
        sort($keys);
        return $keys;
    }

    /**
     * The settings of the project as the file holds them, without the defaults.
     *
     * @return array<string, mixed>
     */
    public function values(string $key): array
    {
        if (!$this->exists($key)) {
            throw new RuntimeException("project: no project {$key}");
        }
        return require $this->fileOf($key);
    }

    /**
     * Makes a project with a new random key and the given settings; returns the key.
     *
     * @param array<string, mixed> $values
     * @param (callable(Settings): void)|null $verify an extra check of the validated settings; it throws to refuse
     */
    public function create(array $values, ?callable $verify = null): string
    {
        return $this->locked(fn (): string => $this->createUnlocked($values, $verify));
    }

    /** The key of the project with the given external id, or null when no project has it. */
    public function keyOfExternalId(string $externalId): ?string
    {
        foreach ($this->keys() as $key) {
            if (($this->values($key)['project']['external_id'] ?? null) === $externalId) {
                return $key;
            }
        }
        return null;
    }

    /**
     * Makes a project with the external id from the given settings, unless a project has this external id already:
     * then it changes nothing. The look-up and the write hold one lock, so two calls with one id make one project.
     * Returns the key and true when the project is new.
     *
     * @param array<string, mixed> $values
     * @param (callable(Settings): void)|null $verify an extra check of the validated settings; it throws to refuse
     * @return array{string, bool}
     */
    public function createForExternalId(string $externalId, array $values, ?callable $verify = null): array
    {
        return $this->locked(function () use ($externalId, $values, $verify): array {
            $key = $this->keyOfExternalId($externalId);
            if ($key !== null) {
                return [$key, false];
            }
            $values['project']['external_id'] = $externalId;
            return [$this->createUnlocked($values, $verify), true];
        });
    }

    /**
     * Changes the settings of a project: `$edit` gets the values of the file and returns the new values. Returns the
     * new values as written.
     *
     * @param callable(array<string, mixed>): array<string, mixed> $edit
     * @param (callable(Settings): void)|null $verify an extra check of the validated settings; it throws to refuse
     * @return array<string, mixed>
     */
    public function change(string $key, callable $edit, ?callable $verify = null): array
    {
        return $this->locked(function () use ($key, $edit, $verify): array {
            $values = $edit($this->values($key));
            $this->write($key, $values, $verify);
            return $values;
        });
    }

    public function delete(string $key): void
    {
        $this->locked(function () use ($key): void {
            $this->values($key);
            $this->files->remove($this->fileOf($key));
        });
    }

    /**
     * @param array<string, mixed> $values
     * @param (callable(Settings): void)|null $verify
     */
    private function createUnlocked(array $values, ?callable $verify): string
    {
        do {
            $key = self::newKey();
        } while ($this->exists($key));
        $this->write($key, $values, $verify);
        return $key;
    }

    private function exists(string $key): bool
    {
        return self::isKey($key) && is_file($this->fileOf($key));
    }

    private static function isKey(string $key): bool
    {
        return strlen($key) === self::KEY_LENGTH && strspn($key, self::KEY_ALPHABET) === self::KEY_LENGTH;
    }

    private function fileOf(string $key): string
    {
        return "{$this->projectsDir}/{$key}.php";
    }

    private static function newKey(): string
    {
        $key = '';
        for ($i = 0; $i < self::KEY_LENGTH; $i++) {
            $key .= self::KEY_ALPHABET[random_int(0, strlen(self::KEY_ALPHABET) - 1)];
        }
        return $key;
    }

    /** @param array<string, mixed> $values */
    private function write(string $key, array $values, ?callable $verify): void
    {
        $candidate = "{$this->projectsDir}/.{$key}." . bin2hex(random_bytes(4)) . '.tmp';
        try {
            $this->files->dumpFile($candidate, "<?php\n// A project of the Formgate Pro registry, in the Lite settings format.\n\ndeclare(strict_types=1);\n\nreturn "
                . var_export($values, true) . ";\n");
            $settings = $this->validated($key, $candidate);
            if ($verify !== null) {
                $verify($settings);
            }
            $this->files->rename($candidate, $this->fileOf($key), true);
        } finally {
            $this->files->remove($candidate);
        }
    }

    /** The settings of the temporary file; the refusal of the Lite validator names the project, not the file. */
    private function validated(string $key, string $candidate): Settings
    {
        try {
            return Settings::fromFile($candidate);
        } catch (RuntimeException $refusal) {
            throw new RuntimeException(str_replace($candidate, "project {$key}", $refusal->getMessage()));
        }
    }

    /**
     * Runs the work while this process holds the lock of the registry; other writers wait.
     *
     * @template T
     * @param callable(): T $work
     * @return T
     */
    private function locked(callable $work): mixed
    {
        $this->files->mkdir($this->projectsDir);
        $lock = fopen("{$this->projectsDir}/" . self::LOCK_FILE, 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            throw new RuntimeException('project: cannot lock the projects folder');
        }
        try {
            return $work();
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
