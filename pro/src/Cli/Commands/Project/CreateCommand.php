<?php
// The CLI command `project:create`: makes a project with a new random key from a name, a first domain and a first
// channel (telegram, email or bitrix24 with its Lite options), and prints the key and the form address. A channel with
// a missing option is refused.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectChannels;
use Formgate\Pro\Projects\ProjectRegistry;
use InvalidArgumentException;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:create', description: 'Create a project with a first domain and a first channel')]
final class CreateCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('name', InputArgument::REQUIRED, 'The name of the project')
            ->addArgument('domain', InputArgument::REQUIRED, 'The first domain that may post forms, for example site.ru')
            ->addArgument('type', InputArgument::OPTIONAL, 'The type of the first channel: telegram, email or bitrix24')
            ->addOption('option', 'o', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, ProjectChannels::OPTION_HELP);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $type = (string) $input->getArgument('type');
        if ($type === '') {
            throw new InvalidArgumentException('channel: a project needs a first channel; give its type (telegram, email or bitrix24) and its options');
        }
        $key = (new ProjectRegistry($this->config->projectsDir()))->create(ProjectChanges::newProject(
            (string) $input->getArgument('name'),
            (string) $input->getArgument('domain'),
            $type,
            ProjectChannels::options($input->getOption('option')),
        ), ProjectChannels::fromConfig($this->config)->verifyLast(...));
        $output->writeln("Key: {$key}");
        $output->writeln("Form address: /f/{$key}");
        return Command::SUCCESS;
    }
}
