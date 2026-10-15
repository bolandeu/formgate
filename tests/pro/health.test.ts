// GET /health of Pro: ok while the database is writable and the worker heartbeat is younger than 2 minutes by the
// injected clock, else an error that names the failed check.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProFolders, type ProFolders, runWorkerOnce, startPro } from '../support/pro.ts';

const workerRanAt = '2026-10-14T12:00:00Z';

let folders: ProFolders;

beforeEach(() => {
  folders = createProFolders();
});

afterEach(() => {
  folders.remove();
});

// GET /health of a Pro whose clock shows `now`.
async function healthAt(now: string) {
  const pro = await startPro(folders, { FORMGATE_TEST_NOW: now });
  try {
    const response = await fetch(`${pro.url}/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    pro.stop();
  }
}

describe('GET /health', () => {
  it('is 200 ok when worker --once ran 1 minute ago, and an error naming the worker 3 minutes later', async () => {
    await runWorkerOnce(folders, workerRanAt);

    expect(await healthAt('2026-10-14T12:01:00Z')).toEqual({ status: 200, body: { ok: true } });

    const later = await healthAt('2026-10-14T12:03:00Z');
    expect(later.status).toBe(503);
    expect(later.body).toEqual({
      ok: false,
      check: 'worker',
      error: 'the worker heartbeat is 180 seconds old, the limit is 120',
    });
  });

  it('is an error naming the worker when the worker never ran', async () => {
    const health = await healthAt(workerRanAt);

    expect(health.status).toBe(503);
    expect(health.body).toEqual({ ok: false, check: 'worker', error: 'the worker has no heartbeat' });
  });
});
