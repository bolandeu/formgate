<?php
// The self-check interface: the page the operator opens by a secret link (a GET on the entry script).

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Intake\HttpRequest;
use Formgate\Response\Response;

interface SelfCheck
{
    /** The self-check answer, or null when the GET is not a self-check request (the kernel answers 405). */
    public function answer(HttpRequest $http): ?Response;
}
