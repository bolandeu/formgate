<?php
// The CLI command `project:case:list`: shows the special cases of a project in their order, each with its number, name, conditions, channels and required fields.

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

#[AsCommand(name: 'project:case:list', description: 'List the special cases of a project')]
final class CaseListCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $cases = (new ProjectRegistry($this->config->projectsDir()))->values((string) $input->getArgument('key'))['cases'] ?? [];
        if ($cases === []) {
            $output->writeln('The project has no special case.');
        }
        foreach ($cases as $index => $case) {
            $output->writeln(ProjectCases::describe($index + 1, $case));
        }
        return Command::SUCCESS;
    }
}
