<?php
// The CLI command `project:domain:remove`: stops a domain from posting forms to a project. The last domain stays.

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

#[AsCommand(name: 'project:domain:remove', description: 'Remove a domain from a project')]
final class DomainRemoveCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('domain', InputArgument::REQUIRED, 'The domain, for example site.ru');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::removeDomain($values, (string) $input->getArgument('domain')),
        );
        $output->writeln('Domain removed.');
        return Command::SUCCESS;
    }
}
