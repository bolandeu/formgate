<?php
// A refusal of a request: a module throws it with the error code and, for field checks, the errors by field;
// the kernel turns it into the answer for the visitor.

declare(strict_types=1);

namespace Formgate\Response;

use RuntimeException;

final class Rejection extends RuntimeException
{
    /** @param array<string, string> $errors field name => text for the visitor */
    public function __construct(public readonly ErrorCode $errorCode, public readonly array $errors = [])
    {
        parent::__construct($errorCode->value);
    }
}
