<?php
// A small HTTP client for channels (ADR 0001): POST through curl, or through PHP streams when the hosting has
// no curl. A transport error throws; any HTTP status comes back with the body.

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
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        return function_exists('curl_init') ? $this->postWithCurl($url, $body) : $this->postWithStreams($url, $body);
    }

    /** @return array{status: int, body: string} */
    private function postWithCurl(string $url, string $body): array
    {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
        ]);
        $answer = curl_exec($curl);
        if (!is_string($answer)) {
            throw new RuntimeException('curl: ' . curl_error($curl));
        }
        return ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'body' => $answer];
    }

    /** @return array{status: int, body: string} */
    private function postWithStreams(string $url, string $body): array
    {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/json',
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
