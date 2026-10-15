<?php
// A spam log entry of a project as the operator sees it and as a release turns it into a queued request: its id, the
// project key, the reason, and what is needed to make the Lite request again (fields, service field values, the time
// it came).

declare(strict_types=1);

namespace Formgate\Pro\Spam;

use DateTimeImmutable;
use Formgate\Intake\Request;
use Formgate\Intake\ServiceFields;
use Formgate\Spam\SpamReason;

final class SpamEntry
{
    /**
     * @param array<string, string> $fields
     * @param array<string, string> $serviceValues the values of ServiceFields::values()
     */
    public function __construct(
        public readonly int $id,
        public readonly string $projectKey,
        public readonly string $receivedAt,
        public readonly SpamReason $reason,
        public readonly array $fields,
        private readonly array $serviceValues,
    ) {
    }

    /** The request as the visitor sent it. */
    public function request(): Request
    {
        return new Request($this->fields, ServiceFields::fromValues($this->serviceValues), new DateTimeImmutable($this->receivedAt));
    }
}
