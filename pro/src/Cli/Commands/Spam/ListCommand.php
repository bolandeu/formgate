<?php
// The CLI command `spam:list`: lists the spam log entries of all projects, each with its id, the project key, the time
// it came, the reason, the route by the project settings now (`unknown` when the project file does not load) and the
// fields (the secret fields masked as in project:show). The operator finds the id here for spam:release.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Spam;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\SecretMask;
use Formgate\Pro\Spam\SpamEntry;
use Formgate\Pro\Spam\SpamLog;
use Formgate\Storage\Records;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Throwable;

#[AsCommand(name: 'spam:list', description: 'List the spam log entries (secret fields masked)')]
final class ListCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $log = SpamLog::open($this->config);
        $entries = $log->entries();
        if ($entries === []) {
            $output->writeln('The spam log is empty.');
        }
        foreach ($entries as $entry) {
            $output->writeln("#{$entry->id} project {$entry->projectKey} received {$entry->receivedAt} reason {$entry->reason->value} route " . self::routeName($log, $entry));
            $output->writeln('  ' . Records::json(SecretMask::mask($entry->fields)), OutputInterface::OUTPUT_RAW);
        }
        return Command::SUCCESS;
    }

    /** A project file that does not load leaves its entries without a route, not the whole list without lines. */
    private static function routeName(SpamLog $log, SpamEntry $entry): string
    {
        try {
            return $log->routeOf($entry->projectKey, $entry->request())->name();
        } catch (Throwable) {
            return 'unknown';
        }
    }
}
