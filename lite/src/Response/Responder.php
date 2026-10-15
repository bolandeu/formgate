<?php
// Chooses the form of the answer (docs/integration.md section 8): JSON for fetch and JSON bodies; for a plain
// form a 303 to __redirect on a project domain or the thank-you page, and to the error page on a refusal, unless
// the settings give a plain form the JSON answer too (project.plain_form_answer).

declare(strict_types=1);

namespace Formgate\Response;

use Formgate\Checks\Origin;
use Formgate\Intake\HttpRequest;
use Formgate\Settings\Settings;

final class Responder
{
    public function __construct(private readonly Settings $settings, private readonly Origin $origin)
    {
    }

    public function success(HttpRequest $http, string $redirect): Response
    {
        if ($this->answersJson($http)) {
            return Response::json(200, ['ok' => true]);
        }
        return Response::redirect($this->origin->isProjectUrl($redirect) ? $redirect : $this->settings->thankYouUrl());
    }

    public function failure(HttpRequest $http, Rejection $rejection): Response
    {
        if ($this->answersJson($http)) {
            return Response::failure($rejection->errorCode, $rejection->errors);
        }
        $errorUrl = $this->settings->errorUrl();
        $separator = str_contains($errorUrl, '?') ? '&' : '?';
        return Response::redirect("{$errorUrl}{$separator}formgate_error={$rejection->errorCode->value}");
    }

    private function answersJson(HttpRequest $http): bool
    {
        return !$http->isPlainForm() || $this->settings->plainFormGetsJson();
    }
}
