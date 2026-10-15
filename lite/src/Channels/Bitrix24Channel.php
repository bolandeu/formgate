<?php
// The Bitrix24 channel: one lead per request through an incoming webhook (crm.lead.add). A field named in `map`
// goes to its lead field; every other field and the consent line go as text into COMMENTS.
// Options: webhook_url, map (request field => lead field), timeout_seconds, default_title (TITLE when no __subject).

declare(strict_types=1);

namespace Formgate\Channels;

use Formgate\Intake\Request;
use RuntimeException;

final class Bitrix24Channel implements Channel
{
    /** Lead fields that Bitrix24 keeps as lists of {VALUE, VALUE_TYPE}. */
    private const MULTI_FIELDS = ['PHONE', 'EMAIL', 'WEB', 'IM'];

    private readonly string $addLeadUrl;
    /** @var array<string, string> */
    private readonly array $map;
    private readonly string $defaultTitle;
    private readonly Http $http;

    /** @param array<string, mixed> $options */
    public function __construct(array $options)
    {
        RequiredOptions::check($options, ['webhook_url', 'timeout_seconds', 'default_title'], 'the bitrix24 channel');
        $this->addLeadUrl = rtrim((string) $options['webhook_url'], '/') . '/crm.lead.add.json';
        $this->map = (array) ($options['map'] ?? []);
        $this->defaultTitle = (string) $options['default_title'];
        $this->http = new Http((int) $options['timeout_seconds']);
    }

    public function send(Request $request): ChannelResult
    {
        try {
            $answer = $this->http->postJson($this->addLeadUrl, ['fields' => $this->leadFields($request)]);
        } catch (RuntimeException $error) {
            return ChannelResult::failed('Bitrix24: ' . $error->getMessage());
        }
        if ($answer['status'] !== 200 || !isset(json_decode($answer['body'], true)['result'])) {
            return ChannelResult::failed("Bitrix24: HTTP {$answer['status']}: " . substr($answer['body'], 0, 300));
        }
        return ChannelResult::delivered();
    }

    /** @return array<string, mixed> */
    private function leadFields(Request $request): array
    {
        $fields = ['TITLE' => $request->service->subject !== '' ? $request->service->subject : $this->defaultTitle];
        foreach ($this->map as $name => $leadField) {
            if ($request->field($name) !== '') {
                $fields[$leadField] = $this->leadValue($leadField, $request->field($name));
            }
        }
        $fields['COMMENTS'] = implode("\n", $request->lines(array_keys($this->map)));
        return $fields;
    }

    /** @return string|list<array{VALUE: string, VALUE_TYPE: string}> */
    private function leadValue(string $leadField, string $value): string|array
    {
        return in_array($leadField, self::MULTI_FIELDS, true) ? [['VALUE' => $value, 'VALUE_TYPE' => 'WORK']] : $value;
    }
}
