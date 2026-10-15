<?php
// The CLI command `project:case:move`: moves a special case to a new place. The first case that matches a request wins, so the order is the priority.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectCases;
use Formgate\Pro\Projects\ProjectRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:case:move', description: 'Move a special case to a new place in the list')]
final class CaseMoveCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('number', InputArgument::REQUIRED, 'The number of the case, the first is 1')
            ->addArgument('place', InputArgument::REQUIRED, 'The new place, the first is 1');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectCases::move($values, (int) $input->getArgument('number'), (int) $input->getArgument('place')),
        );
        $output->writeln('Case moved.');
        return Command::SUCCESS;
    }
}
