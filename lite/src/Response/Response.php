<?php
// An HTTP answer of Lite: status, headers and body. It knows the two forms of the answer contract
// (JSON and a 303 redirect) and sends itself to the visitor.

declare(strict_types=1);

namespace Formgate\Response;

final class Response
{
    /** @param array<string, string> $headers */
    public function __construct(
        private readonly int $status,
        private readonly array $headers = [],
        private readonly string $body = '',
    ) {
    }

    /** @param array<string, mixed> $body */
    public static function json(int $status, array $body): self
    {
        return new self(
            $status,
            ['Content-Type' => 'application/json; charset=utf-8'],
            json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        );
    }

    /**
     * The JSON error answer: {ok:false, code, error, errors?}; errors only when there are field errors.
     *
     * @param array<string, string> $errors
     */
    public static function failure(ErrorCode $code, array $errors = []): self
    {
        $body = ['ok' => false, 'code' => $code->value, 'error' => $code->message()];
        return self::json($code->status(), $errors === [] ? $body : $body + ['errors' => $errors]);
    }

    public static function redirect(string $url): self
    {
        return new self(303, ['Location' => $url]);
    }

    /** @param array<string, string> $headers */
    public function withHeaders(array $headers): self
    {
        return new self($this->status, $this->headers + $headers, $this->body);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }
        echo $this->body;
    }
}
