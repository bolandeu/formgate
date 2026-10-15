<?php
// A request (заявка): the form fields of one submission without service fields, the service fields apart,
// and the time it came. Channels take its text lines, the consent line included.

declare(strict_types=1);

namespace Formgate\Intake;

use DateTimeImmutable;

final class Request
{
    /** @param array<string, string> $fields field name => value; several values are joined by commas */
    public function __construct(
        public readonly array $fields,
        public readonly ServiceFields $service,
        public readonly DateTimeImmutable $receivedAt,
    ) {
    }

    /** The value of a field without outer spaces; empty when the field did not come. */
    public function field(string $name): string
    {
        return trim($this->fields[$name] ?? '');
    }

    /** The same request without the field `$name`. */
    public function without(string $name): self
    {
        return new self(array_diff_key($this->fields, [$name => true]), $this->service, $this->receivedAt);
    }

    /**
     * The request as text lines for a channel: `name: value` per field, then the consent line (docs/integration.md
     * section 4). The kernel delivers only requests that passed the consent check.
     *
     * @param list<string> $except names of the fields to leave out
     * @return list<string>
     */
    public function lines(array $except = []): array
    {
        $lines = [];
        foreach (array_diff_key($this->fields, array_flip($except)) as $name => $value) {
            $lines[] = "{$name}: {$value}";
        }
        $lines[] = 'Согласие на обработку ПД: дано ' . $this->receivedAt->format('d.m.Y H:i');
        return $lines;
    }
}
