<?php
// The webhook channel: one POST per request to the receiver URL. The body is JSON version 1 (docs/integration.md,
// section 3). The signature follows the Standard Webhooks scheme: headers webhook-id, webhook-timestamp and
// webhook-signature (`v1,` + base64 of HMAC-SHA256 over `id.timestamp.body`). A 2xx answer is a delivery.
// Options: url (https unless allow_http), secret (a `whsec_` secret is base64; any other is raw bytes),
// headers (name => value), timeout_seconds, allow_http. Pro gives an address guard that checks the receiver address
// before each send; a refused address is a failed send with the reason.

declare(strict_types=1);

namespace Formgate\Channels;

use Formgate\Intake\Request;
use Formgate\Intake\ServerData;
use RuntimeException;

final class WebhookChannel implements Channel
{
    private const SECRET_PREFIX = 'whsec_';

    private readonly string $url;
    private readonly string $key;
    /** @var array<string, string> */
    private readonly array $headers;
    private readonly Http $http;

    /** @param array<string, mixed> $options */
    public function __construct(array $options, ?AddressGuard $addressGuard = null)
    {
        RequiredOptions::check($options, ['url', 'secret', 'timeout_seconds'], 'the webhook channel');
        $this->url = (string) $options['url'];
        if (!str_starts_with($this->url, 'https://') && ($options['allow_http'] ?? false) !== true) {
            throw new RuntimeException("settings: the webhook channel url {$this->url} is not https; set allow_http to use http");
        }
        $this->key = self::key((string) $options['secret']);
        $this->headers = array_map('strval', (array) ($options['headers'] ?? []));
        $this->http = new Http((int) $options['timeout_seconds'], $addressGuard);
    }

    public function send(Request $request): ChannelResult
    {
        // The self-check sends a request without a request id: it is a test, and its webhook-id is fresh.
        $test = $request->server->requestId === '';
        $id = $test ? ServerData::newRequestId() : $request->server->requestId;
        $body = json_encode($this->body($request, $test), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        try {
            $answer = $this->http->post($this->url, $body, $this->headers + $this->signatureHeaders($id, $body));
        } catch (RuntimeException $error) {
            return ChannelResult::failed('Webhook: ' . $error->getMessage());
        }
        if ($answer['status'] < 200 || $answer['status'] > 299) {
            return ChannelResult::failed("Webhook: HTTP {$answer['status']}");
        }
        return ChannelResult::delivered();
    }

    /** @return array<string, mixed> */
    private function body(Request $request, bool $test): array
    {
        return [
            'version' => 1,
            'test' => $test,
            'request_id' => $request->server->requestId,
            'received_at' => $request->receivedAt->format(DATE_ATOM),
            'form' => $request->service->form,
            'fields' => (object) $request->visitorFields(),
            'meta' => (object) $request->analyticsFields(),
            'service' => ['subject' => $request->service->subject, 'reply_to' => $request->service->replyTo],
            'consent' => $request->consentLine(),
            'ip' => $request->server->ip,
            'user_agent' => $request->server->userAgent,
            'origin_host' => $request->server->originHost,
        ];
    }

    /** @return array<string, string> */
    private function signatureHeaders(string $id, string $body): array
    {
        $timestamp = (string) time();
        return [
            'webhook-id' => $id,
            'webhook-timestamp' => $timestamp,
            'webhook-signature' => 'v1,' . base64_encode(hash_hmac('sha256', "{$id}.{$timestamp}.{$body}", $this->key, true)),
        ];
    }

    private static function key(string $secret): string
    {
        if (!str_starts_with($secret, self::SECRET_PREFIX)) {
            return $secret;
        }
        $key = base64_decode(substr($secret, strlen(self::SECRET_PREFIX)), true);
        if ($key === false || $key === '') {
            throw new RuntimeException('settings: the webhook channel secret starts with whsec_ but is not base64');
        }
        return $key;
    }
}
