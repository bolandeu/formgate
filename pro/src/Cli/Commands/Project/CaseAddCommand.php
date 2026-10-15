<?php
// The CLI command `project:case:add`: adds a special case at the end of the list. The registry checks the case (a condition, existing channels) before it writes.

declare(strict_types=1);

namespace Formgate\Pro\Cli\Commands\Project;

use Formgate\Pro\Config\ProConfig;
use Formgate\Pro\Projects\ProjectCases;
use Formgate\Pro\Projects\ProjectRegistry;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'project:case:add', description: 'Add a special case: a request that matches goes only to the channels of the case')]
final class CaseAddCommand extends Command
{
    public function __construct(private readonly ProConfig $config)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('key', InputArgument::REQUIRED, 'The project key')
            ->addOption('name', null, InputOption::VALUE_REQUIRED, 'The name of the case, for people')
            ->addOption('form', null, InputOption::VALUE_REQUIRED, 'The case holds for this form name (__form)')
            ->addOption('field', null, InputOption::VALUE_REQUIRED, 'The case holds when this field equals the value of --equals')
            ->addOption('equals', null, InputOption::VALUE_REQUIRED, 'The value of --field, compared without case and outer spaces')
            ->addOption('channel', null, InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'A channel of the case, by number or name')
            ->addOption('required', null, InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'A field that the case needs');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $details = [];
        foreach (['name', 'form', 'field', 'equals'] as $option) {
            $details[$option] = $input->getOption($option);
        }
        $values = (new ProjectRegistry($this->config->projectsDir()))->change(
            (string) $input->getArgument('key'),
            fn (array $values): array => ProjectCases::add($values, $details, $input->getOption('channel'), $input->getOption('required')),
        );
        $output->writeln('Case ' . count($values['cases']) . ' added.');
        return Command::SUCCESS;
    }
}
