// install.sh --update: the move to a newer tag, the record of the previous tag, and the rollback when /health fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeCommands, createInstallSandbox, removesVolume, type InstallSandbox } from '../support/install.ts';

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
});
