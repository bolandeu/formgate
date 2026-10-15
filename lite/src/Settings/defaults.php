<?php
// Defaults of the Lite settings: the full settings shape. The operator's settings file overrides any key;
// keys set to null here have no default and the operator must set them where a module needs them.

declare(strict_types=1);

return [
    'project' => [
        // The name of the project in operator alerts; required when the settings have an alert bot.
        'name' => null,
        // Hosts that may post forms and get CORS headers, for example ['site.ru', 'www.site.ru'].
        'domains' => [],
        'honeypot_field' => 'website',
        'consent_field' => 'consent',
        // Proxy addresses whose X-Forwarded-For is trusted for the visitor IP.
        'trusted_proxies' => [],
        // Requests allowed from one IP to one form within the window.
        'rate_limit' => ['requests' => 5, 'window_seconds' => 600],
        // The same fields for the same form within this window are a duplicate: not delivered again.
        'duplicate_window_seconds' => 600,
        // The time token check (docs/integration.md, section 6): when on, a request without a valid __token goes to
        // the spam log. A token is valid from token_min_seconds to token_max_seconds after it is issued.
        'require_token' => false,
        'token_min_seconds' => 5,
        'token_max_seconds' => 7200,
        // The answer to a plain form post (no JSON body, no Accept: application/json): 'redirect' gives a 303 to
        // thank_you_url or error_url, both then required; 'json' gives the JSON answer, as to fetch.
        'plain_form_answer' => 'redirect',
        'thank_you_url' => null,
        'error_url' => null,
        // Days to keep stored requests and the spam log; null keeps them forever.
        'retention_days' => null,
        // Time zone of the consent date in the channels.
        'timezone' => 'Europe/Moscow',
        // Fields that every request must have, for example ['phone']. A special case and the __required of a form
        // can add to them, never take away.
        'required' => [],
    ],
    // Limits of one request (docs/integration.md, section 2) and of the phone check (section 8).
    // Read from the file that the client build includes too, so the server and the client share one source.
    'limits' => json_decode((string) file_get_contents(__DIR__ . '/field-rules.json'), true, 512, JSON_THROW_ON_ERROR),
    // How long a request waits for another one that writes the SQLite storage.
    'storage' => ['sqlite_busy_timeout_seconds' => 10],
    // Ordered list of channels: ['type' => 'telegram', 'options' => [...]], with an optional 'name' => 'hr' that
    // special cases can use instead of the channel number.
    'channels' => [],
    // Special cases, in order: the first case that matches a request replaces the default route (all channels) by its
    // channels. 'when' has 'form' (the __form value) and/or 'field' with 'equals'; every condition must hold, values are
    // compared without case and outer spaces. 'channels' are channel numbers from 1 or channel names. 'name' (for
    // people) and 'required' (fields added to project.required) are optional. Example:
    // ['name' => 'vacancies', 'when' => ['form' => 'vacancy'], 'channels' => [2], 'required' => ['email']].
    'cases' => [],
    // Options that each channel of a type gets unless its own options set them.
    'channel_defaults' => [
        'telegram' => ['api_url' => 'https://api.telegram.org', 'timeout_seconds' => 10],
        'email' => ['timeout_seconds' => 10, 'default_subject' => 'Заявка с сайта'],
        'bitrix24' => ['timeout_seconds' => 10, 'default_title' => 'Заявка с сайта'],
        'webhook' => ['timeout_seconds' => 10, 'allow_http' => false],
    ],
    // The Telegram bot that tells the operator about failed channels: set both bot_token and chat_id, or neither.
    // It takes api_url and timeout_seconds from channel_defaults.telegram unless it sets them.
    'alert' => ['bot_token' => null, 'chat_id' => null],
    // Secret key of the self-check page; null turns the self-check off.
    'selfcheck_key' => null,
];
