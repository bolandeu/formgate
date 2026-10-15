<?php
// The CLI command `worker`: delivers the due queued requests. With --once it makes one run and ends; without it,
// it runs again after the pause of the configuration, until it is stopped.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Worker;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Worker\Worker;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'worker', description: 'Deliver the queued requests to their channels')]
final class WorkerCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('once', null, InputOption::VALUE_NONE, 'Make one run over the due requests and end');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $worker = Worker::fromConfig($this->config);
        $worker->runOnce();
        while (!$input->getOption('once')) {
            sleep($this->config->workerPauseSeconds());
            $worker->runOnce();
        }
        return Command::SUCCESS;
    }
}
