// install.sh install runs: Docker and Compose checks, flags and refused values, .env, tags, --repo and the lock.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  composeCommands,
  createInstallSandbox,
  fixtureSecretKey,
  readEnvFile,
  removesVolume,
  type InstallSandbox,
  type Scenario,
} from '../support/install.ts';

const released: Scenario = { tags: ['v0.4.0', 'v0.5.0'], healthyTags: ['v0.4.0', 'v0.5.0'] };
const answers = ['--domain', 'example.ru', '--port', '8095', '--yes'];

let sandbox: InstallSandbox;
beforeEach(() => {
  sandbox = createInstallSandbox();
});
afterEach(() => sandbox.remove());

const changingCompose = () => composeCommands(sandbox.calls()).filter((command) => command[0] !== 'version');

describe('install.sh install', () => {
  it('installs the highest tag, writes .env with mode 600 and secrets, and prints the project:create command', async () => {
    const run = await sandbox.run(answers, released);

    expect(run.status).toBe(0);
    expect(sandbox.checkouts()).toEqual(['v0.5.0']);
    expect(changingCompose()).toEqual([['build'], ['up', '-d']]);
    const envPath = join(sandbox.dir, '.env');
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    const env = readEnvFile(envPath);
    expect(env.FORMGATE_WEB_PORT).toBe('127.0.0.1:8095');
    expect(env[fixtureSecretKey].length).toBeGreaterThanOrEqual(32);
    expect(env.FORMGATE_RETENTION_DAYS).toBe('30');
    expect(run.stdout).toContain('docker compose exec web php bin/formgate project:create');
    expect(run.stdout).toContain(join(sandbox.dir, 'docs/pro-tls.md'));
  });

  it('waits for GET /health on the web port of .env', async () => {
    await sandbox.run(answers, released);

    const healthCalls = sandbox.calls().filter((call) => call[0] === 'curl');
    expect(healthCalls.at(-1)?.at(-1)).toBe('http://127.0.0.1:8095/health');
  });

  it('writes the bot token and chat of the alert bot', async () => {
    await sandbox.run([...answers, '--alert-bot-token', 'fake-bot-token', '--alert-chat-id', '-100200'], released);

    const env = readEnvFile(join(sandbox.dir, '.env'));
    expect(env.FORMGATE_ALERT_BOT_TOKEN).toBe('fake-bot-token');
    expect(env.FORMGATE_ALERT_CHAT_ID).toBe('-100200');
  });

  it('installs the tag of --version', async () => {
    const run = await sandbox.run([...answers, '--version', 'v0.4.0'], released);

    expect(run.status).toBe(0);
    expect(sandbox.checkouts()).toEqual(['v0.4.0']);
  });

  it('installs the commit of --ref without the tag check', async () => {
    const sha = '3f2a9c1e7b4d5f6a8b9c0d1e2f3a4b5c6d7e8f90';

    const run = await sandbox.run([...answers, '--ref', sha], { tags: [], healthyTags: [sha] });

    expect(run.status).toBe(0);
    expect(sandbox.checkouts()).toEqual([sha]);
    expect(changingCompose()).toEqual([['build'], ['up', '-d']]);
  });

  it('stops with the repository and the ref when git fetch fails, before checkout and docker compose', async () => {
    const run = await sandbox.run([...answers, '--ref', 'abc1234', '--repo', '/srv/source.git'], { ...released, fetchFails: true });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('abc1234');
    expect(run.stderr).toContain('/srv/source.git');
    expect(sandbox.calls().filter((call) => call[0] === 'git' && call.includes('checkout'))).toEqual([]);
    expect(changingCompose()).toEqual([]);
  });

  it('installs the ref from a shallow clone', async () => {
    const work = mkdtempSync(join(tmpdir(), 'formgate-shallow-'));
    try {
      const git = (cwd: string, ...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' }).trim();
      const origin = join(work, 'origin');
      mkdirSync(origin);
      git(origin, 'init', '-q');
      copyFileSync(join(sandbox.source, '.env.example'), join(origin, '.env.example'));
      writeFileSync(join(origin, 'file'), 'one');
      git(origin, 'add', '.');
      git(origin, 'commit', '-q', '-m', 'one');
      writeFileSync(join(origin, 'file'), 'two');
      git(origin, 'commit', '-q', '-a', '-m', 'two');
      const sha = git(origin, 'rev-parse', 'HEAD');
      const shallow = join(work, 'shallow');
      git(work, 'clone', '-q', '--depth', '1', `file://${origin}`, shallow);

      const run = await sandbox.run([...answers, '--ref', sha, '--repo', shallow], { tags: [], healthyTags: [sha], realGit: true });

      expect(run.status).toBe(0);
      expect(git(sandbox.dir, 'rev-parse', 'HEAD')).toBe(sha);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('refuses --ref together with --version and changes nothing', async () => {
    const run = await sandbox.run([...answers, '--ref', 'main', '--version', 'v0.4.0'], released);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('--ref or --version');
    expect(existsSync(sandbox.dir)).toBe(false);
  });

  it('refuses a missing port by name without a terminal and calls no docker compose build or up', async () => {
    const run = await sandbox.run(['--domain', 'example.ru', '--yes'], released);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('--port');
    expect(changingCompose()).toEqual([]);
    expect(existsSync(sandbox.dir)).toBe(false);
  });

  it('refuses --tls without a domain by name', async () => {
    const run = await sandbox.run(['--tls', '--port', '8095', '--yes'], released);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('--domain');
    expect(existsSync(sandbox.dir)).toBe(false);
  });

  it('turns on the tls profile with the domain in .env', async () => {
    const run = await sandbox.run(['--tls', ...answers], released);

    expect(run.status).toBe(0);
    const env = readEnvFile(join(sandbox.dir, '.env'));
    expect(env.COMPOSE_PROFILES).toBe('tls');
    expect(env.FORMGATE_DOMAIN).toBe('example.ru');
  });

  it('keeps an existing .env on a second run and removes no volume', async () => {
    await sandbox.run(answers, released);
    const envPath = join(sandbox.dir, '.env');
    writeFileSync(envPath, readFileSync(envPath, 'utf8').replace('FORMGATE_RETENTION_DAYS=30', 'FORMGATE_RETENTION_DAYS=7'));

    const run = await sandbox.run(['--yes'], released);

    expect(run.status).toBe(0);
    expect(readEnvFile(envPath).FORMGATE_RETENTION_DAYS).toBe('7');
    expect(sandbox.calls().filter(removesVolume)).toEqual([]);
  });

  it('fills FORMGATE_TOKEN_SECRET with a random value and keeps it on a second run', async () => {
    await sandbox.run(answers, released);
    const envPath = join(sandbox.dir, '.env');
    const secret = readEnvFile(envPath).FORMGATE_TOKEN_SECRET;

    const run = await sandbox.run(['--yes'], released);

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(run.status).toBe(0);
    expect(readEnvFile(envPath).FORMGATE_TOKEN_SECRET).toBe(secret);
  });

  it('fills FORMGATE_ADMIN_KEYS with one random key and keeps it on --update', async () => {
    await sandbox.run([...answers, '--version', 'v0.4.0'], released);
    const envPath = join(sandbox.dir, '.env');
    const adminKeys = readEnvFile(envPath).FORMGATE_ADMIN_KEYS;

    const update = await sandbox.run(['--update'], released);

    expect(adminKeys).toMatch(/^[0-9a-f]{64}$/);
    expect(update.status).toBe(0);
    expect(sandbox.checkouts()).toEqual(['v0.4.0', 'v0.5.0']);
    expect(readEnvFile(envPath).FORMGATE_ADMIN_KEYS).toBe(adminKeys);
  });

  it('puts the admin port on 127.0.0.1 next to the web port', async () => {
    await sandbox.run(['--port', '9000', '--yes'], released);

    const env = readEnvFile(join(sandbox.dir, '.env'));
    expect(env.FORMGATE_WEB_PORT).toBe('127.0.0.1:9000');
    expect(env.FORMGATE_ADMIN_PORT).toBe('127.0.0.1:9001');
  });

  it('gives each install its own FORMGATE_TOKEN_SECRET', async () => {
    await sandbox.run(answers, released);
    const first = readEnvFile(join(sandbox.dir, '.env')).FORMGATE_TOKEN_SECRET;
    const other = createInstallSandbox();
    try {
      await other.run(answers, released);

      expect(readEnvFile(join(other.dir, '.env')).FORMGATE_TOKEN_SECRET).not.toBe(first);
    } finally {
      other.remove();
    }
  });

  it('refuses an unknown tag, lists the latest tags and changes nothing', async () => {
    const run = await sandbox.run([...answers, '--version', 'v9.9.9'], released);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('v9.9.9');
    expect(run.stderr).toMatch(/v0\.5\.0\s+v0\.4\.0/);
    expect(existsSync(sandbox.dir)).toBe(false);
    expect(sandbox.checkouts()).toEqual([]);
    expect(changingCompose()).toEqual([]);
  });

  it('refuses without docker, says to install Docker and writes no file', async () => {
    const run = await sandbox.run(answers, { ...released, docker: false });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Install Docker');
    expect(existsSync(sandbox.dir)).toBe(false);
    expect(sandbox.calls().filter((call) => call[0] === 'git')).toEqual([]);
  });

  it('refuses Compose v1, says to install Compose v2 and writes no file', async () => {
    const run = await sandbox.run(answers, { ...released, composeVersion: '1.29.2' });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Install the Docker Compose v2 plugin');
    expect(existsSync(sandbox.dir)).toBe(false);
    expect(changingCompose()).toEqual([]);
  });

  it('refuses while another run holds the lock and changes nothing', async () => {
    mkdirSync(join(sandbox.dir, '.install', 'lock'), { recursive: true });

    const run = await sandbox.run(answers, released);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('another install.sh run');
    expect(existsSync(join(sandbox.dir, '.install', 'lock'))).toBe(true);
    expect(existsSync(join(sandbox.dir, '.env'))).toBe(false);
    expect(sandbox.checkouts()).toEqual([]);
    expect(changingCompose()).toEqual([]);
  });

  it('releases the lock at the end', async () => {
    await sandbox.run(answers, released);

    expect(existsSync(join(sandbox.dir, '.install', 'lock'))).toBe(false);
  });

  it('takes the source from --repo', async () => {
    const repo = 'https://example.test/x.git';

    await sandbox.run([...answers, '--repo', repo], released);

    const gitCalls = sandbox.calls().filter((call) => call[0] === 'git');
    expect(gitCalls.find((call) => call[1] === 'ls-remote')?.at(-1)).toBe(repo);
    expect(gitCalls.find((call) => call.includes('remote'))?.slice(-3)).toEqual(['add', 'origin', repo]);
  });

  it('takes the source from the public GitHub repository by default', async () => {
    await sandbox.run(answers, released);

    const listing = sandbox.calls().find((call) => call[0] === 'git' && call[1] === 'ls-remote');
    expect(listing?.at(-1)).toBe('https://github.com/bolandeu/formgate.git');
  });
});
