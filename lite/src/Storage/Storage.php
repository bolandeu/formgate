<?php
// The storage interface: keeps each request with its route and delivery report, the spam log with the reason, and the rate
// hits and the duplicate store of the spam filter (the hashes of the duplicate check and the used time token ids).
// Every write is atomic under parallel requests.

declare(strict_types=1);

namespace Formgate\Storage;

use DateTimeImmutable;
use Formgate\Channels\DeliveryReport;
use Formgate\Intake\Request;
use Formgate\Routing\Route;
use Formgate\Spam\SpamReason;

interface Storage
{
    /** What the storage is, for the self-check: `sqlite`, `jsonl` or `guarded jsonl`. */
    public function kind(): string;

    public function saveRequest(Request $request, Route $route, DeliveryReport $report): void;

    public function logSpam(Request $request, SpamReason $reason): void;

    /** Records one hit of the key at the time and gives the number of its hits within the window, this one included. */
    public function countHit(string $key, DateTimeImmutable $at, int $windowSeconds): int;

    /**
     * The duplicate store: true when the hash is there and its window has not ended at the time; else records the
     * hash for the window from the time. Each hash keeps its own window, so checks with other windows share the store.
     */
    public function isRepeated(string $hash, DateTimeImmutable $at, int $windowSeconds): bool;
}
