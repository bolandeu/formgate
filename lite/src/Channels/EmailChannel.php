<?php
// The email channel: one email per request through PHPMailer. It tries the methods of the settings in order
// (SMTP or mail()) until one accepts, and fails only when every method failed.
// Options: to (an address or a list), from is set per method, methods, timeout_seconds, default_subject.
// Every letter carries the header X-Tags: formgate, which the shared Mailpit filters by.
// __subject is the subject; the field named by __replyto is the Reply-To.

declare(strict_types=1);

namespace Formgate\Channels;

use Formgate\Channels\Email\EmailMethod;
use Formgate\Intake\Request;
use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

final class EmailChannel implements Channel
{
    /** @var list<string> */
    private readonly array $recipients;
    /** @var list<EmailMethod> */
    private readonly array $methods;
    private readonly int $timeoutSeconds;
    private readonly string $defaultSubject;

    /** @param array<string, mixed> $options */
    public function __construct(array $options)
    {
        RequiredOptions::check($options, ['to', 'methods', 'timeout_seconds', 'default_subject'], 'the email channel');
        $this->recipients = array_values((array) $options['to']);
        $this->methods = array_map(EmailMethod::fromOptions(...), array_values((array) $options['methods']));
        $this->timeoutSeconds = (int) $options['timeout_seconds'];
        $this->defaultSubject = (string) $options['default_subject'];
    }

    public function send(Request $request): ChannelResult
    {
        $failures = [];
        foreach ($this->methods as $method) {
            try {
                $this->mailFor($request, $method)->send();
                return ChannelResult::delivered();
            } catch (MailException $error) {
                $failures[] = "{$method->describe()}: {$error->getMessage()}";
            }
        }
        return ChannelResult::failed('Email: ' . implode('; ', $failures));
    }

    private function mailFor(Request $request, EmailMethod $method): PHPMailer
    {
        $mail = new PHPMailer(true);
        $mail->CharSet = PHPMailer::CHARSET_UTF8;
        $mail->addCustomHeader('X-Tags', 'formgate');
        $method->configure($mail, $this->timeoutSeconds);
        foreach ($this->recipients as $recipient) {
            $mail->addAddress($recipient);
        }
        $replyTo = $request->field($request->service->replyTo);
        if (PHPMailer::validateAddress($replyTo)) {
            $mail->addReplyTo($replyTo);
        }
        $mail->Subject = $request->service->subject !== '' ? $request->service->subject : $this->defaultSubject;
        $mail->Body = implode("\n", $request->lines());
        return $mail;
    }
}
