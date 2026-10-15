<?php
// The CLI command `project:delete`: deletes a project after the operator confirms, or at once with --yes. The queued
// requests of the project stay until retention removes them.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Helper\QuestionHelper;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Question\ConfirmationQuestion;

#[AsCommand(name: 'project:delete', description: 'Delete a project')]
final class DeleteCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addOption('yes', 'y', InputOption::VALUE_NONE, 'Delete without asking');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $registry = new ProjectRegistry($this->config->projectsDir());
        $key = (string) $input->getArgument('key');
        $registry->values($key);
        $question = new ConfirmationQuestion("Delete project {$key}? Its queued requests stay until retention. [y/N] ", false);
        if (!$input->getOption('yes') && !(new QuestionHelper())->ask($input, $output, $question)) {
            $output->writeln('Not deleted.');
            return Command::SUCCESS;
        }
        $registry->delete($key);
        $output->writeln('Deleted.');
        return Command::SUCCESS;
    }
}
