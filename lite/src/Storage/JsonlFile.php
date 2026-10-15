<?php
// One JSONL file of the storage: one JSON record per line, read and written under an exclusive flock, so parallel
// requests never interleave. A guarded file starts with a header line that stops PHP before the data.

declare(strict_types=1);

namespace Formgate\Storage;

use RuntimeException;

final class JsonlFile
{
    public function __construct(private readonly string $path, private readonly string $header)
    {
    }

    /** @param array<string, mixed> $record */
    public function append(array $record): void
    {
        $this->locked(function ($handle) use ($record): void {
            fseek($handle, 0, SEEK_END);
            $this->write($handle, (ftell($handle) === 0 ? $this->header : '') . Records::json($record) . "\n");
        });
    }

    /** @return list<array<string, mixed>> the records, or none when the file is not there; a missing file stays missing */
    public function records(): array
    {
        return is_file($this->path) ? $this->update(fn (array $records): array => $records) : [];
    }

    /**
     * Gives every record to $change and writes back the records it returns.
     *
     * @param callable(list<array<string, mixed>>): array<array<string, mixed>> $change
     * @return list<array<string, mixed>> the records now in the file
     */
    public function update(callable $change): array
    {
        return $this->locked(function ($handle) use ($change): array {
            $records = $this->read($handle);
            $changed = array_values($change($records));
            if ($changed !== $records) {
                ftruncate($handle, 0);
                rewind($handle);
                $lines = array_map(fn (array $record): string => Records::json($record) . "\n", $changed);
                $this->write($handle, $this->header . implode('', $lines));
            }
            return $changed;
        });
    }

    /**
     * @template T
     * @param callable(resource): T $work
     * @return T
     */
    private function locked(callable $work): mixed
    {
        $handle = fopen($this->path, 'c+');
        if ($handle === false || !flock($handle, LOCK_EX)) {
            throw new RuntimeException("storage: cannot open and lock {$this->path}");
        }
        try {
            return $work($handle);
        } finally {
            fflush($handle);
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /**
     * @param resource $handle
     * @return list<array<string, mixed>>
     */
    private function read($handle): array
    {
        rewind($handle);
        $text = (string) stream_get_contents($handle);
        if ($this->header !== '' && str_starts_with($text, $this->header)) {
            $text = substr($text, strlen($this->header));
        }
        $records = array_map(fn (string $line): mixed => json_decode($line, true), explode("\n", $text));
        return array_values(array_filter($records, is_array(...)));
    }

    /** @param resource $handle */
    private function write($handle, string $text): void
    {
        if (fwrite($handle, $text) !== strlen($text)) {
            throw new RuntimeException("storage: cannot write {$this->path}");
        }
    }
}
