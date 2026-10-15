<?php
// The service fields of a request (names starting with `__`, docs/integration.md section 3). They control how the
// request is handled and never reach a channel; unknown `__` fields are ignored. The time token fields (`__token`,
// `__token_unavailable`) are for the spam filter only.

declare(strict_types=1);

namespace Formgate\Intake;

final class ServiceFields
{
    /** Field with the visitor's email when the form gives no __replyto (docs/integration.md section 3). */
    private const DEFAULT_REPLYTO = 'email';

    /**
     * @param list<string> $required names of the fields that must not be empty
     * @param string $token the time token, empty when the client sent none
     * @param bool $tokenUnavailable the client could not get a token (`__token_unavailable=1`)
     */
    public function __construct(
        public readonly string $form,
        public readonly string $subject,
        public readonly string $replyTo,
        public readonly string $redirect,
        public readonly array $required,
        public readonly string $token,
        public readonly bool $tokenUnavailable,
    ) {
    }

    /** @param array<string, string> $values service field name => value; a list value is joined by commas */
    public static function fromValues(array $values): self
    {
        $replyTo = trim($values['__replyto'] ?? '');
        return new self(
            trim($values['__form'] ?? ''),
            trim($values['__subject'] ?? ''),
            $replyTo !== '' ? $replyTo : self::DEFAULT_REPLYTO,
            trim($values['__redirect'] ?? ''),
            array_values(array_filter(array_map('trim', explode(',', $values['__required'] ?? '')))),
            trim($values['__token'] ?? ''),
            trim($values['__token_unavailable'] ?? '') === '1',
        );
    }

    /**
     * The service field values of the delivery, which fromValues() turns back into the same handling: Pro keeps them
     * with a queued request. The time token fields are not among them: the spam filter has checked them.
     *
     * @return array<string, string>
     */
    public function values(): array
    {
        return [
            '__form' => $this->form,
            '__subject' => $this->subject,
            '__replyto' => $this->replyTo,
            '__redirect' => $this->redirect,
            '__required' => implode(',', $this->required),
        ];
    }
}
