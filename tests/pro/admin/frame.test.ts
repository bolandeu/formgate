// The frame of the Pro admin API over HTTP: Bearer keys from FORMGATE_ADMIN_KEYS (any listed key works, so two keys
// allow a rotation), 401 without a right key, 404 everywhere when the list is empty, and no /admin on the form entry.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callAdmin } from '../../support/pro-admin.ts';
import { createProFolders, type Pro, type ProFolders, startPro, startProAdmin } from '../../support/pro.ts';

let folders: ProFolders;
let admin: Pro;
let closedAdmin: Pro;
let form: Pro;

beforeAll(async () => {
  folders = createProFolders();
  admin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: 'k1, k2' });
  closedAdmin = await startProAdmin(folders, { FORMGATE_ADMIN_KEYS: '' });
  form = await startPro(folders, { FORMGATE_ADMIN_KEYS: 'k1' });
});

afterAll(() => {
  admin.stop();
  closedAdmin.stop();
  form.stop();
  folders.remove();
});

describe('the admin keys', () => {
  it('serve a request with any listed key', async () => {
    for (const key of ['k1', 'k2']) {
      const answer = await callAdmin(admin, '/admin/projects/nope', { key });

      expect(answer).toEqual({ status: 404, body: { ok: false, code: 'project_not_found' } });
    }
  });

  it('refuse a wrong key, a part of a key and no key with 401 unauthorized', async () => {
    for (const key of ['k3', 'k', '', undefined]) {
      const answer = await callAdmin(admin, '/admin/projects/nope', { key });

      expect(answer).toEqual({ status: 401, body: { ok: false, code: 'unauthorized' } });
    }
  });

  it('refuse a right key without the Bearer word', async () => {
    const response = await fetch(`${admin.url}/admin/projects/nope`, { headers: { Authorization: 'k1' } });

    expect(response.status).toBe(401);
  });
});

describe('an empty FORMGATE_ADMIN_KEYS', () => {
  it('turns the API off: every admin route answers 404 with any header', async () => {
    const calls = [
      { path: '/admin/projects/nope', key: 'k1' },
      { path: '/admin/projects?external_id=site-1', key: '' },
      { path: '/admin/projects', method: 'POST', body: { external_id: 'site-1' } },
      { path: '/admin/unknown' },
    ];
    for (const { path, ...call } of calls) {
      expect((await callAdmin(closedAdmin, path, call)).status).toBe(404);
    }
  });
});

describe('the routes', () => {
  it('answer 404 to an unknown route with a right key', async () => {
    expect((await callAdmin(admin, '/admin/unknown', { key: 'k1' })).status).toBe(404);
    expect((await callAdmin(admin, '/admin/projects/nope', { key: 'k1', method: 'DELETE' })).status).toBe(404);
  });

  it('are not on the form entry: /admin there is 404 with a right key', async () => {
    const answer = await callAdmin(form, '/admin/projects', { key: 'k1' });

    expect(answer.status).toBe(404);
  });
});
