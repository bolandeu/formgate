<?php
// The CLI command `project:channel:add`: adds a channel (telegram, email or bitrix24) with its Lite options, given as
// --option name=value. A channel with a missing option is refused.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectChannels;
use Formgate\Pro\Projects\ProjectRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:channel:add', description: 'Add a channel to a project')]
final class ChannelAddCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('type', InputArgument::REQUIRED, 'telegram, email or bitrix24')
            ->addOption('option', 'o', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, ProjectChannels::OPTION_HELP);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $options = ProjectChannels::options($input->getOption('option'));
        $values = (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::addChannel($values, (string) $input->getArgument('type'), $options),
            ProjectChannels::fromConfig($this->config)->verifyLast(...),
        );
        $output->writeln('Channel ' . count($values['channels']) . ' added.');
        return Command::SUCCESS;
    }
}
