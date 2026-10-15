<?php
// A stand-in for sendmail in the email tests: writes the message from stdin to its own file in the directory
// given as the first argument, so a test counts the messages that mail() handed over.

declare(strict_types=1);

file_put_contents($argv[1] . '/' . uniqid('mail-', true) . '.eml', stream_get_contents(STDIN));
