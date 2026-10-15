<?php
// The spam filter interface: names the reason when a request is from a bot. The kernel then answers success,
// delivers nothing and puts the request into the spam log.

declare(strict_types=1);

namespace Formgate\Spam;

use Formgate\Intake\HttpRequest;
use Formgate\Intake\Request;

interface SpamFilter
{
    /** The spam reason, or null for a request from a person. */
    public function spamReason(Request $request, HttpRequest $http): ?SpamReason;

    /** The request of a person without the spam filter's own fields, for the channels and the storage. */
    public function withoutTraps(Request $request): Request;
}
