<?php
// A request (заявка): the form fields of one submission without service fields, the service fields apart,
// and the time it came. The fields named meta_* are analytics fields: they stay in `fields` but apart from the
// visitor fields. Channels take its text lines: the visitor fields, the consent line and the source block.

declare(strict_types=1);

namespace Formgate\Intake;

use DateTimeImmutable;

final class Request
{
    /** The name prefix of the analytics fields. */
    public const ANALYTICS_PREFIX = 'meta_';

    /** Source block lines: label => the meta_ fields shown on the line, joined by ` / ` when present. */
    private const SOURCE_BLOCK = [
        'Источник' => ['meta_utm_source', 'meta_utm_medium', 'meta_utm_campaign'],
        'Страница' => ['meta_page'],
        'Реферер' => ['meta_referrer'],
    ];

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

    public static function isAnalytics(string $name): bool
    {
        return str_starts_with($name, self::ANALYTICS_PREFIX);
    }

    /** @return array<string, string> the fields that the visitor filled, without the analytics fields */
    public function visitorFields(): array
    {
        return array_filter($this->fields, fn (string $name): bool => !self::isAnalytics($name), ARRAY_FILTER_USE_KEY);
    }

    /** @return array<string, string> the analytics fields (meta_*) */
    public function analyticsFields(): array
    {
        return array_filter($this->fields, self::isAnalytics(...), ARRAY_FILTER_USE_KEY);
    }

    /**
     * The visitor fields as text lines, `name: value` per field, then the consent line (docs/integration.md
     * section 4). The kernel delivers only requests that passed the consent check.
     *
     * @param list<string> $except names of the fields to leave out
     * @return list<string>
     */
    public function visitorLines(array $except = []): array
    {
        $lines = [];
        foreach (array_diff_key($this->visitorFields(), array_flip($except)) as $name => $value) {
            $lines[] = "{$name}: {$value}";
        }
        $lines[] = $this->consentLine();
        return $lines;
    }

    /** The consent line: the consent was given at the time the request came. */
    public function consentLine(): string
    {
        return 'Согласие на обработку ПД: дано ' . $this->receivedAt->format('d.m.Y H:i');
    }

    /**
     * The request as text lines for a chat or a letter: the visitor lines, then an empty line and the source block
     * (source, page, referrer). A block line without its fields is left out; without any, there is no block.
     *
     * @return list<string>
     */
    public function lines(): array
    {
        $block = [];
        foreach (self::SOURCE_BLOCK as $label => $names) {
            $values = array_filter(array_map($this->field(...), $names), fn (string $value): bool => $value !== '');
            if ($values !== []) {
                $block[] = "{$label}: " . implode(' / ', $values);
            }
        }
        return $block === [] ? $this->visitorLines() : [...$this->visitorLines(), '', ...$block];
    }
}
