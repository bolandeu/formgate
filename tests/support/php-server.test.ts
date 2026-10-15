// startPhpServer leaves no process of its server group behind: after stop(), after a failed start, and after the
// process that started it is killed with SIGKILL. The group is found by a marker in the php command line (the
// error_log path), because the helper hides the process group id.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startPhpServer } from './php-server.ts';

const helperUrl = new URL('./php-server.ts', import.meta.url).href;
const docRoot = fileURLToPath(new URL('.', import.meta.url));

let marker: string;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'formgate-php-server-test-'));
  marker = join(tempDir, 'error.log');
});

afterEach(() => {
  killMarkedGroups();
  rmSync(tempDir, { recursive: true, force: true });
});

// The process group ids of the php -S processes that carry the marker (the starter script carries it too).
function markedGroups(): number[] {
  const rows = execFileSync('ps', ['-axo', 'pgid=,command='], { encoding: 'utf8' }).split('\n');
  const groups = rows.filter((row) => row.includes(marker) && row.includes(' -S 127.0.0.1:')).map((row) => Number.parseInt(row.trim(), 10));
  return [...new Set(groups)];
}

// The number of live processes in the group: the leader and its workers.
function groupSize(group: number) {
  const rows = execFileSync('ps', ['-axo', 'pgid='], { encoding: 'utf8' }).split('\n');
  return rows.filter((row) => Number.parseInt(row.trim(), 10) === group).length;
}

function killMarkedGroups() {
  for (const group of markedGroups()) {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      // The group is gone already.
    }
  }
}

function groupIsGone(group: number) {
  try {
    process.kill(-group, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function waitUntil(done: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  return done();
}

function serverOptions(readyPath = '/') {
  return {
    ini: { log_errors: '1', error_log: marker },
    serve: ['-t', docRoot],
    env: { PHP_CLI_SERVER_WORKERS: '4' },
    readyPath,
  };
}

describe('startPhpServer', () => {
  it('stop() leaves no process of the group, workers included', async () => {
    const server = await startPhpServer(serverOptions());
    await Promise.all(Array.from({ length: 8 }, () => fetch(server.origin)));
    const [group] = markedGroups();
    expect(group).toBeGreaterThan(0);
    // The leader and its 4 workers.
    expect(groupSize(group)).toBe(5);

    server.stop();
    server.stop();

    expect(await waitUntil(() => groupIsGone(group), 5000)).toBe(true);
  });

  it('a start that never gets an answer throws and leaves no process of the group', async () => {
    // A ready path that makes every probe fail: the server runs but the helper never sees it answer.
    const start = startPhpServer(serverOptions(':bad'));
    const seen = await waitUntil(() => markedGroups().length > 0, 3000);
    const [group] = markedGroups();
    expect(seen).toBe(true);

    await expect(start).rejects.toThrow('php -S did not start');

    expect(await waitUntil(() => groupIsGone(group), 5000)).toBe(true);
  }, 20_000);

  it('the group dies within 5 s when the process that started it is killed with SIGKILL', async () => {
    const script = `
      import { startPhpServer } from ${JSON.stringify(helperUrl)};
      await startPhpServer(${JSON.stringify(serverOptions())});
      console.log('ready');
      setInterval(() => {}, 1000);
    `;
    const starter = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      await new Promise<void>((resolve, reject) => {
        starter.once('error', reject);
        starter.once('exit', () => reject(new Error('the starter process ended before the server was ready')));
        starter.stdout.on('data', (chunk) => String(chunk).includes('ready') && resolve());
      });
      const [group] = markedGroups();
      expect(group).toBeGreaterThan(0);

      starter.kill('SIGKILL');

      expect(await waitUntil(() => groupIsGone(group), 5000)).toBe(true);
    } finally {
      starter.kill('SIGKILL');
    }
  });
});
