<?php
// Field checks of the server (docs/integration.md section 8): the required fields of the route (those of the settings
// and of __required) are not empty, a phone
// has the allowed number of digits, the email (or the field named by __replyto) has a valid address syntax.

declare(strict_types=1);

namespace Formgate\Checks;

use Formgate\Intake\Request;
use Formgate\Response\ErrorCode;
use Formgate\Response\Rejection;

final class FieldCheck
{
    public function __construct(private readonly int $phoneDigitsMin, private readonly int $phoneDigitsMax)
    {
    }

    /** @param list<string> $required the names of the fields that must not be empty */
    public function check(Request $request, array $required): void
    {
        // A field with several problems shows the first one: an empty required field first.
        $errors = self::requiredErrors($request, $required) + $this->phoneErrors($request) + self::emailErrors($request);
        if ($errors !== []) {
            throw new Rejection(ErrorCode::ValidationFailed, $errors);
        }
    }

    /**
     * @param list<string> $required
     * @return array<string, string>
     */
    private static function requiredErrors(Request $request, array $required): array
    {
        $errors = [];
        foreach ($required as $name) {
            if ($request->field($name) === '') {
                $errors[$name] = 'Заполните это поле.';
            }
        }
        return $errors;
    }

    /** @return array<string, string> the phone error when the phone came with a wrong number of digits */
    private function phoneErrors(Request $request): array
    {
        $phone = $request->field('phone');
        $digits = strlen((string) preg_replace('/\D/', '', $phone));
        if ($phone === '' || ($digits >= $this->phoneDigitsMin && $digits <= $this->phoneDigitsMax)) {
            return [];
        }
        $range = "от {$this->phoneDigitsMin} до {$this->phoneDigitsMax}";
        return ['phone' => "Проверьте телефон: в номере должно быть {$range} цифр."];
    }

    /** @return array<string, string> the email error when the email came with a bad syntax or no dot in the domain */
    private static function emailErrors(Request $request): array
    {
        $field = $request->service->replyTo;
        $email = $request->field($field);
        $isValid = filter_var($email, FILTER_VALIDATE_EMAIL, FILTER_FLAG_EMAIL_UNICODE) !== false
            && str_contains(substr($email, (int) strrpos($email, '@') + 1), '.');
        return $email === '' || $isValid ? [] : [$field => 'Проверьте email: адрес записан с ошибкой.'];
    }
}
