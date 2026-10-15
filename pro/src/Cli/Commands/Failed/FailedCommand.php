<?php
// The CLI command `failed`: lists the requests that are not delivered after the last repeat, each with its id, the
// project key, the time it came, the route and the failed channels with their reasons.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Failed;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'failed', description: 'List the requests that are not delivered')]
final class FailedCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $requests = (new Queue(new Database($this->config)))->notDelivered();
        if ($requests === []) {
            $output->writeln('No request is not delivered.');
        }
        foreach ($requests as $queued) {
            $output->writeln("#{$queued->id} project {$queued->projectKey} received {$queued->receivedAt} route {$queued->route}");
            foreach ($queued->report()->failures() as $channelName => $reason) {
                $output->writeln("  {$channelName}: {$reason}");
            }
        }
        return Command::SUCCESS;
    }
}
