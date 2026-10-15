<?php
// The self-check of a Pro project over HTTP: there is none, so a GET on /f/<key> gets 405 as any non-POST.
// The operator checks a project from the CLI.

declare(strict_types=1);

namespace Formgate\Pro\Http;

use Formgate\Intake\HttpRequest;
use Formgate\Response\Response;
use Formgate\SelfCheck\SelfCheck;

final class NoSelfCheck implements SelfCheck
{
    public function answer(HttpRequest $http): ?Response
    {
        return null;
    }
}
