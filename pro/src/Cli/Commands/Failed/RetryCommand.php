<?php
// The CLI command `failed:retry`: repeats at once one request that is not delivered (by id) or all of a project
// (--project=<key>). Only the channels that did not accept the request get it. A wrong id changes nothing.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Failed;

use Formgate\Channels\DeliveryStatus;
use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Queue\Database;
use Formgate\Pro\Queue\Queue;
use Formgate\Pro\Queue\QueuedRequest;
use Formgate\Pro\Worker\RequestDelivery;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'failed:retry', description: 'Repeat the requests that are not delivered, to the channels that did not accept them')]
final class RetryCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('id', InputArgument::OPTIONAL, 'The id of one request');
        $this->addOption('project', null, InputOption::VALUE_REQUIRED, 'The key of a project: all its requests');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $id = $input->getArgument('id');
        $project = $input->getOption('project');
        if (($id === null) === ($project === null)) {
            $output->writeln('<error>Give a request id or --project=<key>, not both.</error>');
            return Command::FAILURE;
        }
        $db = new Database($this->config);
        $queue = new Queue($db);
        $requests = $queue->notDelivered($project);
        if ($id !== null) {
            $requests = array_values(array_filter($requests, fn (QueuedRequest $queued): bool => (string) $queued->id === $id));
            if ($requests === []) {
                $output->writeln('<error>request not found in the failed list</error>');
                return Command::FAILURE;
            }
        }
        $delivery = RequestDelivery::create($this->config, $db, $queue);
        $status = Command::SUCCESS;
        foreach ($requests as $queued) {
            $report = $delivery->atOnce($queued);
            if ($report->status() === DeliveryStatus::Delivered) {
                $output->writeln("#{$queued->id} delivered");
                continue;
            }
            $status = Command::FAILURE;
            $output->writeln("#{$queued->id} still not delivered");
            foreach ($report->failures() as $channelName => $reason) {
                $output->writeln("  {$channelName}: {$reason}");
            }
        }
        return $status;
    }
}
