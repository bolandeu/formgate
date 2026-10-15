// Ten domain additions started at once: the registry lock keeps every one, and the file stays valid PHP settings.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createProFolders, type ProFolders } from '../../support/pro.ts';
import { createProject, runProject } from '../../support/pro-projects.ts';

let folders: ProFolders;

beforeEach(() => {
  folders = createProFolders();
});

afterEach(() => folders.remove());

it('keeps all 10 domains of 10 parallel additions in a valid settings file', async () => {
  const key = await createProject(folders, 'Acme', 'site.ru');
  const added = Array.from({ length: 10 }, (_, index) => `site${index}.ru`);

  const runs = await Promise.all(added.map((domain) => runProject(folders, 'domain:add', [key, domain])));

  expect(runs.map((run) => run.status)).toEqual(Array(10).fill(0));
  const selfCheck = await runProject(folders, 'self-check', [key]);
  expect(selfCheck.status).toBe(0);
  expect(selfCheck.stdout.trim()).toMatch(/^ok\s+telegram #1: configured$/);
  const shown = JSON.parse((await runProject(folders, 'show', [key])).stdout);
  expect([...shown.project.domains].sort()).toEqual(['site.ru', ...added].sort());
});
