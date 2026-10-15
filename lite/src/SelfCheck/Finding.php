<?php
// One line of the self-check page: what was checked, how it went (ok, warning or fail) and the detail for the operator.

declare(strict_types=1);

namespace Formgate\SelfCheck;

final class Finding
{
    private function __construct(
        public readonly string $label,
        public readonly string $level,
        public readonly string $detail,
    ) {
    }

    public static function ok(string $label, string $detail): self
    {
        return new self($label, 'ok', $detail);
    }

    public static function warning(string $label, string $detail): self
    {
        return new self($label, 'warning', $detail);
    }

    public static function fail(string $label, string $detail): self
    {
        return new self($label, 'fail', $detail);
    }
}
