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
     * Joins each field to one text value and checks the field count and the value length.
     *
     * @param array<array-key, mixed> $raw
     * @return array<string, string>
     */
    private function values(array $raw): array
    {
        if (count($raw) > $this->settings->limit('max_fields')) {
            throw new Rejection(ErrorCode::PayloadTooLarge);
        }
        $values = [];
        foreach ($raw as $name => $value) {
            $values[(string) $name] = self::text($value);
            if (mb_strlen($values[(string) $name]) > $this->settings->limit('max_value_length')) {
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
