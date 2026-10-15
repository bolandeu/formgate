<?php
// The refusal of a spam log release: the entry is not there, or its reason is not a token reason. The message tells
// the operator why; nothing has changed.

declare(strict_types=1);

namespace Formgate\Pro\Spam;

use RuntimeException;

final class ReleaseRefused extends RuntimeException
{
}
