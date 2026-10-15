<?php
// The Pro CLI: a symfony/console application that registers every command class found under Commands (one
// subfolder per area). A new command is one new file there; each command gets the global Pro configuration.

declare(strict_types=1);

namespace Formgate\Pro\Cli;

use Formgate\Pro\Config\ProConfig;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;
use Symfony\Component\Console\Application;

final class ConsoleApplication extends Application
{
    public function __construct(ProConfig $config)
    {
        parent::__construct('formgate-pro');
        foreach (self::commandClasses() as $class) {
            $this->add(new $class($config));
        }
    }

    /** @return list<class-string<\Symfony\Component\Console\Command\Command>> the classes of the files under Commands */
    private static function commandClasses(): array
    {
        $folder = __DIR__ . '/Commands';
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($folder, RecursiveDirectoryIterator::SKIP_DOTS));
        $classes = [];
        foreach ($files as $file) {
            /** @var SplFileInfo $file */
            if ($file->getExtension() === 'php') {
                $relative = substr($file->getPathname(), strlen($folder) + 1, -strlen('.php'));
                $classes[] = __NAMESPACE__ . '\\Commands\\' . str_replace('/', '\\', $relative);
            }
        }
        sort($classes);
        return $classes;
    }
}
