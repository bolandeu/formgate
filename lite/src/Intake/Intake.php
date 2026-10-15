<?php
// Request intake: checks the content type and the size limits, reads the fields of a urlencoded, multipart
// (files dropped) or JSON body, joins several values by a comma and splits the service fields off.

declare(strict_types=1);

namespace Formgate\Intake;

use Formgate\Clock;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;
use Formgate\Settings\Settings;

final class Intake
{
    /** The kind of field => the names of its count limit and its value length limit. */
    private const LIMITS = [
        'visitor' => ['max_fields', 'max_value_length'],
        'analytics' => ['max_meta_fields', 'max_meta_value_length'],
    ];

    public function __construct(private readonly Settings $settings)
    {
    }

    public function parse(HttpRequest $http): Request
    {
        if (!$http->isForm() && !$http->isJson()) {
            throw new Rejection(ErrorCode::UnsupportedMediaType);
        }
        if ($http->bodySize() > $this->settings->limit('max_body_bytes')) {
            throw new Rejection(ErrorCode::PayloadTooLarge);
        }
        $values = $this->values($http->isJson() ? self::jsonFields($http->body) : $http->formFields);
        $fields = array_filter($values, fn (string $name): bool => !str_starts_with($name, '__'), ARRAY_FILTER_USE_KEY);
        return new Request(
            $fields,
            ServiceFields::fromValues(array_diff_key($values, $fields)),
            Clock::now($this->settings->timezone()),
        );
    }

    /**
     * Joins each field to one text value and checks the count and the value length of the visitor fields and,
     * apart, of the analytics fields (meta_*).
     *
     * @param array<array-key, mixed> $raw
     * @return array<string, string>
     */
    private function values(array $raw): array
    {
        $values = [];
        $counts = ['visitor' => 0, 'analytics' => 0];
        foreach ($raw as $name => $value) {
            $kind = Request::isAnalytics((string) $name) ? 'analytics' : 'visitor';
            [$maxFields, $maxValueLength] = self::LIMITS[$kind];
            $values[(string) $name] = self::text($value);
            if (
                ++$counts[$kind] > $this->settings->limit($maxFields)
                || mb_strlen($values[(string) $name]) > $this->settings->limit($maxValueLength)
            ) {
                throw new Rejection(ErrorCode::PayloadTooLarge);
            }
        }
        return $values;
    }

    /** @return array<array-key, mixed> */
    private static function jsonFields(string $body): array
    {
        $fields = json_decode($body, true);
        if (!is_array($fields)) {
            throw new Rejection(ErrorCode::UnsupportedMediaType);
        }
        return $fields;
    }

    /** One field value as text: several values (`interests[]`, a JSON array) are joined by a comma. */
    private static function text(mixed $value): string
    {
        return is_array($value) ? implode(', ', array_map(self::text(...), $value)) : (string) $value;
    }
}
