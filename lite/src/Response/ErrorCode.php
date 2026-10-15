<?php
// The error codes of the answer contract (docs/integration.md section 8): the HTTP status and the general text
// for the visitor of each code.

declare(strict_types=1);

namespace Formgate\Response;

enum ErrorCode: string
{
    case OriginNotAllowed = 'origin_not_allowed';
    case ProjectNotFound = 'project_not_found';
    case PayloadTooLarge = 'payload_too_large';
    case MethodNotAllowed = 'method_not_allowed';
    case UnsupportedMediaType = 'unsupported_media_type';
    case ValidationFailed = 'validation_failed';
    case ConsentRequired = 'consent_required';
    case DeliveryFailed = 'delivery_failed';
    case ServerError = 'server_error';

    public function status(): int
    {
        return match ($this) {
            self::OriginNotAllowed => 403,
            self::ProjectNotFound => 404,
            self::PayloadTooLarge => 413,
            self::MethodNotAllowed => 405,
            self::UnsupportedMediaType => 415,
            self::ValidationFailed, self::ConsentRequired => 422,
            self::DeliveryFailed, self::ServerError => 500,
        };
    }

    public function message(): string
    {
        return match ($this) {
            self::OriginNotAllowed => 'Форма этого сайта не подключена к обработчику заявок.',
            self::ProjectNotFound => 'Форма отправляет заявку по неверному адресу.',
            self::PayloadTooLarge => 'Заявка слишком большая.',
            self::MethodNotAllowed => 'Заявка принимается только методом POST.',
            self::UnsupportedMediaType => 'Неподдерживаемый формат заявки.',
            self::ValidationFailed => 'Проверьте поля формы.',
            self::ConsentRequired => 'Нужно согласие на обработку персональных данных.',
            self::DeliveryFailed => 'Не удалось отправить заявку. Позвоните нам или попробуйте позже.',
            self::ServerError => 'Не удалось отправить заявку. Попробуйте позже.',
        };
    }
}
