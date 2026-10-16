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
  return groupRows(group).filter((row) => !isZombie(row)).length;
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

// The processes of the group as `ps` rows: pid, pgid, state, command.
function groupRows(group: number) {
  const rows = execFileSync('ps', ['-axo', 'pid=,pgid=,stat=,command='], { encoding: 'utf8' }).split('\n');
  return rows.filter((row) => Number.parseInt(row.trim().split(/\s+/)[1], 10) === group);
}

function isZombie(row: string) {
  return row.trim().split(/\s+/)[2].startsWith('Z');
}

// A group is gone when none of its processes is alive. A zombie (state Z) is dead: in the CI job container PID 1
// is `sleep 3600`, which never reaps orphans, so the killed workers stay in the group as zombies and
// `kill(-group, 0)` would still find the group.
function groupIsGone(group: number) {
  return groupRows(group).every(isZombie);
}

// Waits up to 5 s for the group to be gone; on failure the message shows the processes that stay in it.
async function expectGroupGone(group: number) {
  const gone = await waitUntil(() => groupIsGone(group), 5000);
  expect(gone, `processes stay in group ${group}:\n${groupRows(group).join('\n')}`).toBe(true);
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

    await expectGroupGone(group);
  });

  it('a start that never gets an answer throws and leaves no process of the group', async () => {
    // A ready path that makes every probe fail: the server runs but the helper never sees it answer.
    const start = startPhpServer(serverOptions(':bad'));
    const seen = await waitUntil(() => markedGroups().length > 0, 3000);
    const [group] = markedGroups();
    expect(seen).toBe(true);

    await expect(start).rejects.toThrow('php -S did not start');

    await expectGroupGone(group);
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

      await expectGroupGone(group);
    } finally {
      starter.kill('SIGKILL');
    }
  });
});

describe('groupIsGone', () => {
  // A perl parent forks a child into a new group whose id is the child pid, prints that pid and never reaps the
  // child. perl sets the group, not the shell: dash (/bin/sh on Debian) has no job control without a tty.
  async function holdChild(child: 'exit' | 'sleep 30') {
    const perl = `my $pid = fork; if ($pid == 0) { setpgrp(0, 0); ${child}; } setpgrp($pid, $pid); $| = 1; print "$pid\\n"; sleep 30;`;
    const holder = spawn('perl', ['-e', perl], { stdio: ['ignore', 'pipe', 'inherit'] });
    const group = await new Promise<number>((resolve) => holder.stdout.once('data', (chunk) => resolve(Number.parseInt(String(chunk), 10))));
    return { holder, group };
  }

  it('counts a group whose processes are all zombies as gone', async () => {
    const { holder, group } = await holdChild('exit');
    try {
      const zombie = await waitUntil(() => groupRows(group).some(isZombie), 5000);
      expect(zombie, `no zombie in group ${group}`).toBe(true);
      expect(groupIsGone(group)).toBe(true);
    } finally {
      holder.kill('SIGKILL');
    }
  });

  it('does not count a group with a live process as gone', async () => {
    const { holder, group } = await holdChild('sleep 30');
    try {
      expect(groupIsGone(group)).toBe(false);
    } finally {
      process.kill(-group, 'SIGKILL');
      holder.kill('SIGKILL');
    }
  });
});
