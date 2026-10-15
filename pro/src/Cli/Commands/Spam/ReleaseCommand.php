<?php
// The CLI command `spam:release`: makes the spam log entry of a token reason (by id) a normal queued request, so the
// worker delivers it to the channels of its project. An entry of another reason or a wrong id is refused and changes
// nothing.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Spam;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Spam\ReleaseRefused;
use Formgate\Pro\Spam\SpamLog;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'spam:release', description: 'Queue a spam log entry of a token reason for delivery')]
final class ReleaseCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('id', InputArgument::REQUIRED, 'The id of the spam log entry (spam:list shows it)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $given = (string) $input->getArgument('id');
        try {
            SpamLog::open($this->config)->release($given);
        } catch (ReleaseRefused $refusal) {
            $output->writeln("<error>{$refusal->getMessage()}</error>");
            return Command::FAILURE;
        }
        $output->writeln("Spam log entry {$given} is queued: the worker delivers it.");
        return Command::SUCCESS;
    }
}
