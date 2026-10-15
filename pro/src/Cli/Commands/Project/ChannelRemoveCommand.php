<?php
// The CLI command `project:channel:remove`: removes a channel, found by its number in the project. The last channel
// stays: the Lite validator wants at least one.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:channel:remove', description: 'Remove a channel from a project')]
final class ChannelRemoveCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('number', InputArgument::REQUIRED, 'The number of the channel, the first is 1');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::removeChannel($values, (int) $input->getArgument('number')),
        );
        $output->writeln('Channel removed.');
        return Command::SUCCESS;
    }
}
