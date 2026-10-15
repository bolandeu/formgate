// Helpers for the Pro project CLI tests: runs a project command on the folders of a test and reads the files of the
// project registry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CliRun, type ProFolders, runCli } from './pro.ts';

// Runs `project:<command>` with the arguments; `input` is what the operator types at a question. The wide terminal
// keeps an error message on one line.
export function runProject(folders: ProFolders, command: string, args: string[] = [], input?: string): Promise<CliRun> {
  return runCli(folders, [`project:${command}`, ...args], { COLUMNS: '1000' }, input);
}

// The key that `project:create` printed.
export function printedKey(run: CliRun): string {
  const match = /^Key: (\S+)$/m.exec(run.stdout);
  if (!match) throw new Error(`no key in the output: ${run.stdout}${run.stderr}`);
  return match[1];
}

// The first channel of a project that a test makes: a telegram channel with every option it needs.
export const telegramChannel = ['telegram', '-o', 'bot_token=123:ABC', '-o', 'chat_id=-100'];

// Creates a project with the CLI and returns its key; a refused create throws with its output.
export async function createProject(folders: ProFolders, name: string, domain: string, channel = telegramChannel): Promise<string> {
  const run = await runProject(folders, 'create', [name, domain, ...channel]);
  if (run.status !== 0) throw new Error(`project:create failed: ${run.stdout}${run.stderr}`);
  return printedKey(run);
}

// The bytes of the settings file of a project.
export function projectFile(folders: ProFolders, key: string): string {
  return readFileSync(join(folders.projects, `${key}.php`), 'utf8');
}
