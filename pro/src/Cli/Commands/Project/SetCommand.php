<?php
// The CLI command `project:set`: changes one setting of a project by its dotted path (thank-you and error pages,
// rate limit, time token check and limits, limits of a request).

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

#[AsCommand(name: 'project:set', description: 'Change one setting of a project, for example limits.max_fields 20')]
final class SetCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('path', InputArgument::REQUIRED, 'The dotted path, for example project.thank_you_url or limits.max_fields')
            ->addArgument('value', InputArgument::REQUIRED, 'The new value; true/false for project.require_token');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::set($values, (string) $input->getArgument('path'), (string) $input->getArgument('value')),
        );
        $output->writeln('Changed.');
        return Command::SUCCESS;
    }
}
