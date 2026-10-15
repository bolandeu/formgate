<?php
// The consent check (docs/integration.md section 4): the consent field must be exactly `1`; the browser default
// `on` of a checkbox without a value does not count.

declare(strict_types=1);

namespace Formgate\Checks;

use Formgate\Intake\Request;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;

final class ConsentCheck
{
    public function __construct(private readonly string $consentField)
    {
    }

    public function check(Request $request): void
    {
        if ($request->field($this->consentField) !== '1') {
            throw new Rejection(ErrorCode::ConsentRequired);
        }
    }
}
