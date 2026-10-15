<?php
// The CLI command `project:show`: prints the settings of one project with the secrets masked, or, with no key, one
// line per project.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Projects\SecretMask;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:show', description: 'Show one project (secrets masked) or list all projects')]
final class ShowCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::OPTIONAL, 'The project key; without it all projects are listed');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $registry = new ProjectRegistry($this->config->projectsDir());
        $key = $input->getArgument('key');
        if ($key !== null) {
            $output->writeln(json_encode(SecretMask::mask($registry->values($key)), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            return Command::SUCCESS;
        }
        foreach ($registry->keys() as $each) {
            $project = $registry->values($each)['project'] ?? [];
            $output->writeln(sprintf('%s  %s  %s', $each, $project['name'] ?? '', implode(',', $project['domains'] ?? [])));
        }
        return Command::SUCCESS;
    }
}
