<?php
// The CLI command `project:domain:add`: lets one more domain post forms to a project.

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

#[AsCommand(name: 'project:domain:add', description: 'Add a domain to a project')]
final class DomainAddCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('domain', InputArgument::REQUIRED, 'The domain, for example other.ru');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::addDomain($values, (string) $input->getArgument('domain')),
        );
        $output->writeln('Domain added.');
        return Command::SUCCESS;
    }
}
