<?php
// The HTML of the self-check page: a table of findings. Every text is escaped, and the page carries no secret of the
// settings (the key, tokens, passwords).

declare(strict_types=1);

namespace Formgate\SelfCheck;

use Formgate\Response\Response;

final class SelfCheckPage
{
    /** @param list<Finding> $findings */
    public static function response(array $findings): Response
    {
        $rows = array_map(fn (Finding $finding): string => sprintf(
            '<tr class="%1$s"><th>%2$s</th><td>%1$s</td><td>%3$s</td></tr>',
            $finding->level,
            self::escape($finding->label),
            self::escape($finding->detail),
        ), $findings);
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
            . '<title>Formgate Lite self-check</title></head><body><h1>Formgate Lite self-check</h1><table>'
            . implode('', $rows) . '</table></body></html>';
        return new Response(200, [
            'Content-Type' => 'text/html; charset=utf-8',
            'Cache-Control' => 'no-store',
            'X-Robots-Tag' => 'noindex',
            'Referrer-Policy' => 'no-referrer',
        ], $html);
    }

    private static function escape(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
