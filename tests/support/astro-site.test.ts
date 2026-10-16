// buildSite leaves no temp folder behind when the build fails. (A good build is not run here: it would share the
// astro-basic prerender cache with tests/astro/integration.test.ts.)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { AstroIntegration } from 'astro';
import { buildSite } from './astro-site.ts';

it('a failed build removes its temp folder before buildSite throws', async () => {
  let outDir = '';
  const failing: AstroIntegration = {
    name: 'failing',
    hooks: {
      'astro:config:setup': ({ config }) => {
        outDir = fileURLToPath(config.outDir);
        throw new Error('build failed on purpose');
      },
    },
  };

  await expect(buildSite('astro-basic', [failing])).rejects.toThrow('build failed on purpose');

  expect(outDir).not.toBe('');
  expect(existsSync(outDir)).toBe(false);
}, 120_000);
