<?php
// A small HTTP client for channels (ADR 0001): POST through curl, or through PHP streams when the hosting has
// no curl. A transport error throws; any HTTP status comes back with the body. A redirect is never followed:
// its status comes back as the answer.

declare(strict_types=1);

namespace Formgate\Channels;

use RuntimeException;

final class Http
{
    public function __construct(private readonly int $timeoutSeconds)
    {
    }

    /**
     * @param array<string, mixed> $payload sent as a JSON body
     * @return array{status: int, body: string}
     */
    public function postJson(string $url, array $payload): array
    {
        return $this->post($url, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    /**
     * @param string $body sent as it is, with Content-Type application/json
     * @param array<string, string> $headers extra headers, header name => value
     * @return array{status: int, body: string}
     */
    public function post(string $url, string $body, array $headers = []): array
    {
        $lines = ['Content-Type: application/json'];
        foreach ($headers as $name => $value) {
            $lines[] = "{$name}: {$value}";
        }
        return function_exists('curl_init')
            ? $this->postWithCurl($url, $body, $lines)
            : $this->postWithStreams($url, $body, $lines);
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    private function postWithCurl(string $url, string $body, array $headers): array
    {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);
        $answer = curl_exec($curl);
        if (!is_string($answer)) {
            throw new RuntimeException('curl: ' . curl_error($curl));
        }
        return ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'body' => $answer];
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    private function postWithStreams(string $url, string $body, array $headers): array
    {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'follow_location' => 0,
            'content' => $body,
            'timeout' => $this->timeoutSeconds,
            'ignore_errors' => true,
        ]]);
        $answer = @file_get_contents($url, false, $context);
        if ($answer === false) {
            throw new RuntimeException('PHP streams: ' . (error_get_last()['message'] ?? 'the request failed'));
        }
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+ (\d+)#', $line, $match) === 1) {
                $status = (int) $match[1];
            }
        }
        return ['status' => $status, 'body' => $answer];
    }
}
