<?php
// The CLI command `project:channel:change`: puts new options over the options of a channel, found by its number in
// the project (`telegram #2` is number 2). A channel with a missing option is refused.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectChanges;
use Formgate\Pro\Projects\ProjectChannels;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Settings\Settings;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:channel:change', description: 'Change the options of a channel of a project')]
final class ChannelChangeCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addArgument('number', InputArgument::REQUIRED, 'The number of the channel, the first is 1')
            ->addOption('option', 'o', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, ProjectChannels::OPTION_HELP);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $number = (int) $input->getArgument('number');
        $options = ProjectChannels::options($input->getOption('option'));
        (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectChanges::changeChannel($values, $number, $options),
            fn (Settings $settings) => ProjectChannels::verify($settings, $number),
        );
        $output->writeln("Channel {$number} changed.");
        return Command::SUCCESS;
    }
}
