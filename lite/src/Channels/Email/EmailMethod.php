<?php
// One way to hand an email to a mail system: `smtp` (host, port, encryption ssl|tls|starttls|none, optional
// login and password) or `mail` (PHP mail() through the sendmail of the hosting). It checks its options and
// sets a PHPMailer up for itself; EmailChannel tries the methods one by one.

declare(strict_types=1);

namespace Formgate\Channels\Email;

use Formgate\Channels\RequiredOptions;
use PHPMailer\PHPMailer\PHPMailer;
use RuntimeException;

final class EmailMethod
{
    private const ENCRYPTIONS = ['ssl', 'tls', 'starttls', 'none'];

    /** @param array<string, mixed> $options */
    private function __construct(private readonly array $options)
    {
    }

    /** @param array<string, mixed> $options */
    public static function fromOptions(array $options): self
    {
        $type = $options['type'] ?? null;
        $required = match ($type) {
            'smtp' => ['host', 'port', 'encryption', 'from'],
            'mail' => ['from'],
            default => throw new RuntimeException('settings: an email method has the type smtp or mail'),
        };
        RequiredOptions::check($options, $required, "the email method {$type}");
        if ($type === 'smtp' && !in_array($options['encryption'], self::ENCRYPTIONS, true)) {
            throw new RuntimeException('settings: the email method smtp has encryption ' . implode('|', self::ENCRYPTIONS));
        }
        return new self($options);
    }

    /** The method for error_log and alerts; it never holds the password. */
    public function describe(): string
    {
        return $this->options['type'] === 'smtp' ? "SMTP {$this->options['host']}:{$this->options['port']}" : 'mail()';
    }

    public function configure(PHPMailer $mail, int $timeoutSeconds): void
    {
        $mail->setFrom((string) $this->options['from']);
        if ($this->options['type'] === 'mail') {
            $mail->isMail();
            return;
        }
        $mail->isSMTP();
        $mail->Host = (string) $this->options['host'];
        $mail->Port = (int) $this->options['port'];
        $mail->Timeout = $timeoutSeconds;
        $this->configureEncryption($mail, (string) $this->options['encryption']);
        $login = (string) ($this->options['login'] ?? '');
        if ($login !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = $login;
            $mail->Password = (string) ($this->options['password'] ?? '');
        }
    }

    private function configureEncryption(PHPMailer $mail, string $encryption): void
    {
        $mail->SMTPSecure = match ($encryption) {
            'ssl' => PHPMailer::ENCRYPTION_SMTPS,
            'tls', 'starttls' => PHPMailer::ENCRYPTION_STARTTLS,
            'none' => '',
        };
        $mail->SMTPAutoTLS = $encryption !== 'none';
    }
}
