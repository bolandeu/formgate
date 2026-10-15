<?php
// The global Pro configuration: each environment variable that Pro reads, with its default. A null default has no
// value here: the operator must set the variable. An empty default means "not set" for an optional variable.

declare(strict_types=1);

return [
    // The folder of the SQLite database (the queue, the spam log, the heartbeats).
    'FORMGATE_DATA_DIR' => null,
    // The folder of the project settings files, <key>.php each, in the Lite settings format.
    'FORMGATE_PROJECTS_DIR' => null,
    // How long a request waits for another process that writes the SQLite database.
    'FORMGATE_SQLITE_BUSY_TIMEOUT_SECONDS' => '10',
    // GET /health fails when the last worker heartbeat is older than this.
    'FORMGATE_WORKER_HEARTBEAT_MAX_AGE_SECONDS' => '120',
    // The pause of the worker loop between two runs over the due queued requests.
    'FORMGATE_WORKER_PAUSE_SECONDS' => '5',
    // The pauses of the repeat schedule, in seconds, comma separated: 1 min, 5 min, 15 min, 1 h, 3 h, 12 h, 24 h.
    // The first pause starts at the first failure, each next pause at the failure of the previous repeat. After the
    // last repeat a request that is still not delivered gets the status not delivered.
    'FORMGATE_REPEAT_SCHEDULE_SECONDS' => '60,300,900,3600,10800,43200,86400',
    // A channel is down after this many failures in a row, on any requests of its project.
    'FORMGATE_CHANNEL_DOWN_AFTER_FAILURES' => '3',
    // Requests and spam log entries older than this many days are deleted by the worker.
    'FORMGATE_RETENTION_DAYS' => '30',
    // The worker deletes the old entries at most once in this many seconds.
    'FORMGATE_RETENTION_INTERVAL_SECONDS' => '3600',
    // The secret that signs the time tokens of all projects. Without it a project with require_token on answers
    // server_error to a token request, and its self-check fails.
    'FORMGATE_TOKEN_SECRET' => '',
    // The keys of the admin API, comma separated: a request with `Authorization: Bearer <key>` of any of them is
    // served, so two keys can be valid during a rotation. Empty turns the admin API off.
    'FORMGATE_ADMIN_KEYS' => '',
    // On (1, true, on) turns the private-address guard of the webhook channels off: a receiver on this server or on a
    // private network is allowed. Off, a receiver host must resolve to public addresses only.
    'FORMGATE_WEBHOOK_ALLOW_PRIVATE' => '0',
    // The operator alert bot for all of Pro (one Telegram bot). Without a token the alerts are only logged.
    'FORMGATE_ALERT_BOT_TOKEN' => '',
    'FORMGATE_ALERT_CHAT_ID' => '',
    // The Telegram Bot API host of the alert bot (a fake server in tests) and its timeout.
    'FORMGATE_ALERT_API_URL' => 'https://api.telegram.org',
    'FORMGATE_ALERT_TIMEOUT_SECONDS' => '10',
];
