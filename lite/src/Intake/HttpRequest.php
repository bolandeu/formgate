<?php
// The HTTP request as Lite sees it: method, the headers it needs, the query, the parsed form fields, the body and
// the address of the direct peer.
// Built once from the PHP globals; the other modules read it and never touch the globals.

declare(strict_types=1);

namespace Formgate\Intake;

final class HttpRequest
{
    private const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data'];

    /**
     * @param array<string, string> $headers header names in lower case
     * @param array<string, mixed> $query
     * @param array<string, mixed> $formFields the fields PHP parsed from a form body
     */
    public function __construct(
        public readonly string $method,
        private readonly array $headers,
        public readonly array $query,
        public readonly array $formFields,
        public readonly string $body,
        public readonly string $peerAddress,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (str_starts_with($name, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($name, 5)))] = (string) $value;
            }
        }
        $headers['content-type'] = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
        $headers['content-length'] = (string) ($_SERVER['CONTENT_LENGTH'] ?? '');
        return new self(
            strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            $headers,
            $_GET,
            $_POST,
            (string) file_get_contents('php://input'),
            (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        );
    }

    public function header(string $name): string
    {
        return $this->headers[$name] ?? '';
    }

    /** The media type of the body without parameters, in lower case: `multipart/form-data`. */
    public function mediaType(): string
    {
        return strtolower(trim(explode(';', $this->header('content-type'))[0]));
    }

    public function isJson(): bool
    {
        return $this->mediaType() === 'application/json';
    }

    /** The body size in bytes: Content-Length, or the read body when the header is missing. */
    public function bodySize(): int
    {
        $length = $this->header('content-length');
        return $length === '' ? strlen($this->body) : (int) $length;
    }

    /** A plain HTML form post without JS: the answer is a 303 redirect, not JSON. */
    public function isPlainForm(): bool
    {
        return $this->method === 'POST'
            && $this->isForm()
            && !$this->acceptsJson();
    }

    /** The client asks for a JSON answer: Accept names application/json. */
    public function acceptsJson(): bool
    {
        return str_contains(strtolower($this->header('accept')), 'application/json');
    }

    /** The page the request came from: Origin, or Referer when Origin is missing. */
    public function source(): string
    {
        return $this->header('origin') !== '' ? $this->header('origin') : $this->header('referer');
    }

    /** A urlencoded or multipart body: PHP has parsed its fields into $formFields. */
    public function isForm(): bool
    {
        return in_array($this->mediaType(), self::FORM_TYPES, true);
    }
}
