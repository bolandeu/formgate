<?php
// The JSONL storage: one JSONL file each for requests, the spam log, rate hits and the duplicate store (the hashes
// of the duplicate check and the used time token ids), in the storage place: plain files above the site root, else
// guarded files in the Lite folder.

declare(strict_types=1);

namespace Formgate\Storage;

use DateTimeImmutable;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Routing\Route;
use Formgate\Spam\SpamReason;

final class JsonlStorage implements Storage
{
    private readonly JsonlFile $requests;
    private readonly JsonlFile $spamLog;
    private readonly JsonlFile $rateHits;
    private readonly JsonlFile $duplicates;

    public function __construct(private readonly StoragePlace $place, private readonly Retention $retention)
    {
        $this->requests = $place->jsonlFile('requests');
        $this->spamLog = $place->jsonlFile('spam-log');
        $this->rateHits = $place->jsonlFile('rate-hits');
        $this->duplicates = $place->jsonlFile('duplicates');
    }

    public function kind(): string
    {
        return $this->place->isGuarded ? 'guarded jsonl' : 'jsonl';
    }

    public function saveRequest(Request $request, Route $route, DeliveryReport $report): void
    {
        $this->requests->append(Records::request($request, $route, $report));
        $this->deleteOld($request->receivedAt);
    }

    public function logSpam(Request $request, SpamReason $reason): void
    {
        $this->spamLog->append(Records::spam($request, $reason));
        $this->deleteOld($request->receivedAt);
    }

    public function countHit(string $key, DateTimeImmutable $at, int $windowSeconds): int
    {
        $since = $at->getTimestamp() - $windowSeconds;
        $hits = $this->rateHits->update(
            fn (array $hits): array => [...self::after($hits, $since), ['key' => $key, 'at' => $at->getTimestamp()]],
        );
        return count(array_filter($hits, fn (array $hit): bool => $hit['key'] === $key));
    }

    public function isRepeated(string $hash, DateTimeImmutable $at, int $windowSeconds): bool
    {
        $now = $at->getTimestamp();
        $isRepeated = false;
        $this->duplicates->update(function (array $hashes) use ($hash, $now, $windowSeconds, &$isRepeated): array {
            $hashes = array_filter($hashes, fn (array $record): bool => ($record['until'] ?? 0) > $now);
            $isRepeated = in_array($hash, array_column($hashes, 'hash'), true);
            return $isRepeated ? $hashes : [...$hashes, ['hash' => $hash, 'until' => $now + $windowSeconds]];
        });
        return $isRepeated;
    }

    private function deleteOld(DateTimeImmutable $now): void
    {
        $cutoff = $this->retention->cutoff($now);
        if ($cutoff === null) {
            return;
        }
        foreach ([$this->requests, $this->spamLog] as $file) {
            $file->update(fn (array $entries): array => array_filter(
                $entries,
                fn (array $entry): bool => $entry['received_at'] >= $cutoff,
            ));
        }
    }

    /**
     * @param list<array<string, mixed>> $records records with a Unix time `at`
     * @return list<array<string, mixed>> the records after the time
     */
    private static function after(array $records, int $since): array
    {
        return array_values(array_filter($records, fn (array $record): bool => $record['at'] > $since));
    }
}
