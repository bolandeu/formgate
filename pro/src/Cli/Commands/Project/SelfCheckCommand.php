<?php
// The CLI command `project:self-check`: the time token check (with the check on) and each channel of a project are ok
// or fail with the reason, without any secret.
// A test message goes to the channels only with --send. The exit code is non-zero when a channel fails.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectRegistry;
use Formgate\Pro\Projects\ProjectSelfCheck;
use Formgate\Pro\Projects\SecretMask;
use Formgate\Pro\Token\EnvironmentSigningKey;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:self-check', description: 'Check the channels of a project')]
final class SelfCheckCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addOption('send', null, InputOption::VALUE_NONE, 'Send a test message through each channel');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $registry = new ProjectRegistry($this->config->projectsDir());
        $key = (string) $input->getArgument('key');
        $settings = $registry->find($key) ?? throw new \RuntimeException("project: no project {$key}");
        $secrets = $registry->values($key);
        $status = Command::SUCCESS;
        foreach (ProjectSelfCheck::run($settings, new EnvironmentSigningKey($this->config), (bool) $input->getOption('send')) as $finding) {
            $output->writeln(SecretMask::scrub(sprintf('%-4s %s: %s', $finding->level, $finding->label, $finding->detail), $secrets), OutputInterface::OUTPUT_RAW);
            $status = $finding->level === 'fail' ? Command::FAILURE : $status;
        }
        return $status;
    }
}
