// install.sh --update: the move to a newer tag, the record of the previous tag, the rollback when /health fails, and the
// keys of the new .env.example that .env lacks.
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeCommands, createInstallSandbox, readEnvFile, removesVolume, type InstallSandbox } from '../support/install.ts';

const tags = ['v0.4.0', 'v0.5.0'];

let sandbox: InstallSandbox;
beforeEach(async () => {
  sandbox = createInstallSandbox();
  const install = await sandbox.run(['--version', 'v0.4.0', '--port', '8095', '--yes'], { tags, healthyTags: tags });
  expect(install.status).toBe(0);
});
afterEach(() => sandbox.remove());

// The git fetches and checkouts and the compose build and up of the update run, in call order.
function updateSteps(callsBefore: number) {
  return sandbox
    .calls()
    .slice(callsBefore)
    .flatMap((call) => {
      if (call[0] === 'git' && call.includes('fetch')) return [`fetch ${call.at(-1)}`];
      if (call[0] === 'git' && call.includes('checkout')) return ['checkout'];
      const [command] = composeCommands([call]);
      return command && command[0] !== 'version' ? [command.join(' ')] : [];
    });
}

const readState = (name: string) => readFileSync(join(sandbox.dir, '.install', name), 'utf8').trim();

describe('install.sh --update', () => {
  it('moves to the highest tag, ignores --ref and records the previous tag', async () => {
    const callsBefore = sandbox.calls().length;

    const run = await sandbox.run(['--update', '--ref', 'main'], { tags, healthyTags: tags });

    expect(run.status).toBe(0);
    expect(updateSteps(callsBefore)).toEqual(['fetch v0.5.0', 'checkout', 'build', 'up -d']);
    expect(sandbox.checkouts().at(-1)).toBe('v0.5.0');
    expect(readState('tag')).toBe('v0.5.0');
    expect(readState('previous-tag')).toBe('v0.4.0');
    expect(sandbox.calls().filter(removesVolume)).toEqual([]);
  });

  it('keeps the repository of an installation made from another repo', async () => {
    await sandbox.run(['--repo', '/srv/other.git', '--version', 'v0.4.0', '--port', '8095', '--yes'], { tags, healthyTags: tags });
    const callsBefore = sandbox.calls().length;

    const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

    expect(run.status).toBe(0);
    const gitCalls = sandbox.calls().slice(callsBefore).filter((call) => call[0] === 'git');
    expect(gitCalls.find((call) => call[1] === 'ls-remote')?.at(-1)).toBe('/srv/other.git');
    expect(gitCalls.find((call) => call.includes('set-url'))?.at(-1)).toBe('/srv/other.git');
  });

  it('rolls back to the previous tag when /health does not answer and names the failed tag', async () => {
    const callsBefore = sandbox.calls().length;

    const run = await sandbox.run(['--update', '--health-timeout', '2'], { tags, healthyTags: ['v0.4.0'] });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('v0.5.0');
    expect(updateSteps(callsBefore)).toEqual([
      'fetch v0.5.0',
      'checkout',
      'build',
      'up -d',
      'fetch v0.4.0',
      'checkout',
      'build',
      'up -d',
    ]);
    expect(sandbox.checkouts().slice(-2)).toEqual(['v0.5.0', 'v0.4.0']);
    expect(readState('tag')).toBe('v0.4.0');
    expect(sandbox.calls().filter(removesVolume)).toEqual([]);
  });

  it('stops with the repository and the tag when git fetch fails, without a rollback and docker compose', async () => {
    const callsBefore = sandbox.calls().length;

    const run = await sandbox.run(['--update', '--repo', '/srv/source.git'], { tags, healthyTags: tags, fetchFails: true });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('v0.5.0');
    expect(run.stderr).toContain('/srv/source.git');
    expect(run.stderr).not.toContain('rolling back');
    expect(updateSteps(callsBefore)).toEqual(['fetch v0.5.0']);
    expect(readState('tag')).toBe('v0.4.0');
  });

  it('refuses without an install in the folder', async () => {
    const empty = createInstallSandbox();
    try {
      const run = await empty.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('no Pro install');
    } finally {
      empty.remove();
    }
  });

  describe('the keys of the new .env.example', () => {
    const envPath = () => join(sandbox.dir, '.env');
    const lineList = () => readFileSync(envPath(), 'utf8').split('\n');

    it('appends a missing empty secret with a random value, names only the key and keeps the other lines', async () => {
      const without = lineList().filter((line) => !line.startsWith('FORMGATE_TOKEN_SECRET='));
      writeFileSync(envPath(), without.join('\n'));

      const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).toBe(0);
      const secret = readEnvFile(envPath()).FORMGATE_TOKEN_SECRET;
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      expect(run.stdout).toContain('added to .env: FORMGATE_TOKEN_SECRET');
      expect(run.stdout).not.toContain(secret);
      expect(lineList().filter((line) => !line.startsWith('FORMGATE_TOKEN_SECRET='))).toEqual(without);
      expect(statSync(envPath()).mode & 0o777).toBe(0o600);
    });

    it('never changes a key that .env has, also an empty one', async () => {
      writeFileSync(envPath(), readFileSync(envPath(), 'utf8').replace(/^FORMGATE_RETENTION_DAYS=.*$/m, 'FORMGATE_RETENTION_DAYS=7').replace(/^FORMGATE_TOKEN_SECRET=.*$/m, 'FORMGATE_TOKEN_SECRET='));
      const lines = readFileSync(envPath(), 'utf8');

      const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).toBe(0);
      expect(readFileSync(envPath(), 'utf8')).toBe(lines);
      expect(readEnvFile(envPath()).FORMGATE_RETENTION_DAYS).toBe('7');
      expect(readEnvFile(envPath()).FORMGATE_TOKEN_SECRET).toBe('');
      expect(run.stdout).not.toContain('added to .env');
    });

    it('never activates a key that .env has as a commented line', async () => {
      writeFileSync(envPath(), readFileSync(envPath(), 'utf8').replace(/^FORMGATE_TOKEN_SECRET=.*$/m, '# FORMGATE_TOKEN_SECRET=old'));
      appendFileSync(join(sandbox.source, '.env.example'), 'FORMGATE_IMAGE_TAG=latest\n');
      const lines = readFileSync(envPath(), 'utf8');

      const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).toBe(0);
      expect(readFileSync(envPath(), 'utf8')).toBe(lines);
      expect(run.stdout).not.toContain('added to .env');
    });

    it('appends a missing FORMGATE_ADMIN_KEYS empty', async () => {
      writeFileSync(envPath(), readFileSync(envPath(), 'utf8').replace(/^FORMGATE_ADMIN_KEYS=.*\n/m, ''));

      const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).toBe(0);
      expect(readEnvFile(envPath()).FORMGATE_ADMIN_KEYS).toBe('');
      expect(run.stdout).toContain('added to .env: FORMGATE_ADMIN_KEYS');
    });

    it('appends a new non-secret key with the example value', async () => {
      appendFileSync(join(sandbox.source, '.env.example'), 'FORMGATE_NEW_LIMIT=42\n');

      const run = await sandbox.run(['--update'], { tags, healthyTags: tags });

      expect(run.status).toBe(0);
      expect(readEnvFile(envPath()).FORMGATE_NEW_LIMIT).toBe('42');
      expect(run.stdout).toContain('added to .env: FORMGATE_NEW_LIMIT');
    });

    it('keeps the appended keys after a rollback', async () => {
      appendFileSync(join(sandbox.source, '.env.example'), 'FORMGATE_NEW_LIMIT=42\n');

      const run = await sandbox.run(['--update', '--health-timeout', '2'], { tags, healthyTags: ['v0.4.0'] });

      expect(run.status).not.toBe(0);
      expect(readEnvFile(envPath()).FORMGATE_NEW_LIMIT).toBe('42');
    });
  });
});
