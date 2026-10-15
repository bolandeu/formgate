<?php
// The CLI command `project:case:remove`: removes a special case by its number; the cases after it take the next lower numbers.

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

#[AsCommand(name: 'project:case:remove', description: 'Remove a special case')]
final class CaseRemoveCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('number', InputArgument::REQUIRED, 'The number of the case, the first is 1');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectCases::remove($values, (int) $input->getArgument('number')),
        );
        $output->writeln('Case removed.');
        return Command::SUCCESS;
    }
}
