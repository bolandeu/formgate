// Test harness for the Astro integration: builds a fixture site with the Astro API into a temp folder and
// gives the built files back.
import { build } from 'astro';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AstroInlineConfig, AstroIntegration } from 'astro';

const projectRoot = process.cwd();

export interface BuiltSite {
  root: string;
  dist: string;
  read(path: string): string;
}

export async function buildSite(
  fixture: string,
  integrations: AstroIntegration[],
  config: AstroInlineConfig = {},
): Promise<BuiltSite> {
  const dist = mkdtempSync(join(tmpdir(), `formgate-${fixture}-`));
  // Astro writes its prerender cache into the working directory: each fixture build runs inside its own folder,
  // so builds of two test files do not overwrite each other's cache.
  const root = resolve(projectRoot, 'tests/fixtures', fixture);
  const workingDir = process.cwd();
  process.chdir(root);
  try {
    await build({ ...config, root, outDir: dist, cacheDir: join(dist, '.cache'), logLevel: 'silent', integrations });
  } finally {
    process.chdir(workingDir);
  }
  return { root, dist, read: (path) => readFileSync(join(dist, path), 'utf8') };
}
