// Test harness for Pro: a temp data folder and projects folder, project settings files (Lite format) by project
// key, the Pro form entry and the admin entry under php -S, the CLI and `worker --once` as PHP processes, and a read of the SQLite queue.
// The clock is injected with FORMGATE_TEST_NOW. Fake channels and the posts come from the Lite harness.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { writeSettingsFile } from './lite.ts';
import { php, startPhpServer } from './php-server.ts';

const proDir = fileURLToPath(new URL('../../pro/', import.meta.url));

// The global Pro configuration of a test: a data folder and a projects folder in one temp folder.
export interface ProFolders {
  data: string;
  projects: string;
  env: Record<string, string>;
  writeProject(key: string, settings: object): void;
  remove(): void;
}

export interface Pro {
  url: string;
  formUrl(key: string): string;
  errorLog(): string;
  stop(): void;
}

export interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface QueuedRequest {
  project_key: string;
  received_at: string;
  form: string;
  fields: Record<string, string>;
  status: string;
  channels: Record<string, { delivered: boolean; reason: string }>;
}

export function createProFolders(): ProFolders {
  const base = mkdtempSync(join(tmpdir(), 'formgate-pro-'));
  const data = join(base, 'data');
  const projects = join(base, 'projects');
  mkdirSync(data);
  mkdirSync(projects);
  return {
    data,
    projects,
    env: { FORMGATE_DATA_DIR: data, FORMGATE_PROJECTS_DIR: projects },
    writeProject: (key, settings) => writeSettingsFile(join(projects, `${key}.php`), settings),
    remove: () => rmSync(base, { recursive: true, force: true }),
  };
}

// Starts the Pro form entry on the folders; `env` adds variables, for example FORMGATE_TEST_NOW.
export function startPro(folders: ProFolders, env: Record<string, string> = {}): Promise<Pro> {
  return startEntry('index.php', folders, env);
}

// Starts the Pro admin entry (the admin port) on the folders; `env` gives FORMGATE_ADMIN_KEYS.
export function startProAdmin(folders: ProFolders, env: Record<string, string> = {}): Promise<Pro> {
  return startEntry('admin.php', folders, env);
}

async function startEntry(script: string, folders: ProFolders, env: Record<string, string>): Promise<Pro> {
  const errorLog = join(folders.data, `error-${Date.now()}-${Math.random()}.log`);
  const server = await startPhpServer({
    ini: { log_errors: '1', display_errors: '0', error_log: errorLog },
    serve: ['-t', join(proDir, 'public'), join(proDir, 'public', script)],
    env: { ...folders.env, ...env },
    readyPath: '/health',
  });
  return {
    url: server.origin,
    formUrl: (key) => `${server.origin}/f/${key}`,
    errorLog: () => (existsSync(errorLog) ? readFileSync(errorLog, 'utf8') : ''),
    stop: server.stop,
  };
}

// Runs the Pro CLI with the arguments and waits for it to end. The run does not block the test process, so the
// fake channels of the test can answer the worker. `input` is the text the operator types: it makes the run
// interactive, so a question reads it.
export function runCli(folders: ProFolders, args: string[], env: Record<string, string> = {}, input?: string): Promise<CliRun> {
  const interactive = input === undefined ? {} : { SHELL_INTERACTIVE: '1' };
  const child = spawn(php, [join(proDir, 'bin/formgate'), ...args], {
    env: { ...process.env, ...folders.env, ...interactive, ...env },
  });
  child.stdin.end(input ?? '');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// Runs `worker --once` at the given time of the injected clock, or now; a failed run throws with its output.
export async function runWorkerOnce(folders: ProFolders, now?: string): Promise<CliRun> {
  const run = await runCli(folders, ['worker', '--once'], now ? { FORMGATE_TEST_NOW: now } : {});
  if (run.status !== 0) throw new Error(`worker --once failed: ${run.stdout}${run.stderr}`);
  return run;
}

// The requests in the queue table, in the order they came; none when the queue table is not made yet.
export function readQueue(folders: ProFolders): QueuedRequest[] {
  const file = join(folders.data, 'formgate.sqlite');
  if (!existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'queue'").get()) return [];
    const rows = db.prepare('SELECT project_key, received_at, form, fields, status, channels FROM queue ORDER BY id').all();
    return rows.map((row) => ({
      ...row,
      fields: JSON.parse(String(row.fields)),
      channels: JSON.parse(String(row.channels)),
    })) as unknown as QueuedRequest[];
  } finally {
    db.close();
  }
}
