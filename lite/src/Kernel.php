<?php
// The kernel of Lite and Pro: handles one HTTP request from start to answer. It runs the modules in order (preflight,
// the time token request and self-check, method, origin, intake, spam filter, routing, consent and field checks) and
// hands the checked request with its route to the delivery: Lite sends it at once, Pro stores it in its queue. It turns a refusal or an
// unexpected error into the answer of docs/integration.md section 8.

declare(strict_types=1);

namespace Formgate;

use Formgate\Channels\ChannelFactory;
use Formgate\Checks\ConsentCheck;
use Formgate\Checks\FieldCheck;
use Formgate\Checks\Origin;
use Formgate\Delivery\Delivery;
use Formgate\Intake\HttpRequest;
use Formgate\Intake\Intake;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;
use Formgate\Response\Responder;
use Formgate\Response\Response;
use Formgate\Routing\Router;
use Formgate\SelfCheck\SelfCheck;
use Formgate\Settings\Settings;
use Formgate\Spam\SpamFilter;
use Formgate\Storage\Storage;
use Formgate\Token\TimeTokens;
use Throwable;

final class Kernel
{
    private readonly Origin $origin;
    private readonly Intake $intake;
    private readonly Router $router;
    private readonly ConsentCheck $consentCheck;
    private readonly FieldCheck $fieldCheck;
    private readonly Responder $responder;

    public function __construct(
        Settings $settings,
        private readonly Storage $storage,
        private readonly SpamFilter $spamFilter,
        private readonly Delivery $delivery,
        private readonly SelfCheck $selfCheck,
        private readonly TimeTokens $timeTokens,
    ) {
        $this->origin = new Origin($settings->domains());
        $this->intake = new Intake($settings);
        $this->router = new Router($settings, new ChannelFactory());
        $this->consentCheck = new ConsentCheck($settings->consentField());
        $this->fieldCheck = new FieldCheck($settings->limit('phone_digits_min'), $settings->limit('phone_digits_max'));
        $this->responder = new Responder($settings, $this->origin);
    }

    public function handle(HttpRequest $http): Response
    {
        try {
            $response = $this->dispatch($http);
        } catch (Rejection $rejection) {
            $response = $this->responder->failure($http, $rejection);
        } catch (Throwable $error) {
            error_log('formgate: ' . $error->getMessage());
            $response = $this->responder->failure($http, new Rejection(ErrorCode::ServerError));
        }
        return $response->withHeaders($this->origin->corsHeaders($http));
    }

    private function dispatch(HttpRequest $http): Response
    {
        if ($http->method === 'OPTIONS') {
            return $this->origin->preflight($http);
        }
        if ($http->method === 'GET') {
            return $this->answerGet($http);
        }
        if ($http->method !== 'POST') {
            throw new Rejection(ErrorCode::MethodNotAllowed);
        }
        $this->origin->check($http);
        $request = $this->intake->parse($http);
        $spamReason = $this->spamFilter->spamReason($request, $http);
        if ($spamReason !== null) {
            $this->storage->logSpam($request, $spamReason);
        } else {
            $request = $this->spamFilter->withoutTraps($request);
            $route = $this->router->route($request);
            $this->consentCheck->check($request);
            $this->fieldCheck->check($request, $route->required);
            $this->delivery->deliver($request, $route);
        }
        return $this->responder->success($http, $request->service->redirect);
    }

    /** GET ?token gives a time token to a project domain, as a post would be checked; another GET is a self-check. */
    private function answerGet(HttpRequest $http): Response
    {
        if (!array_key_exists('token', $http->query)) {
            return $this->selfCheck->answer($http) ?? throw new Rejection(ErrorCode::MethodNotAllowed);
        }
        $this->origin->check($http);
        return Response::json(200, $this->timeTokens->issue())->withHeaders(['Cache-Control' => 'no-store']);
    }

}
