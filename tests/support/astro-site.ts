// Test harness for the Astro integration: builds a fixture site with the Astro API into a temp folder and
// gives the built files back. It keeps the built sites and removes their temp folders on dispose.
import { build } from 'astro';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AstroInlineConfig, AstroIntegration } from 'astro';

const projectRoot = process.cwd();

export interface BuiltSite {
  root: string;
  dist: string;
  read(path: string): string;
  dispose(): void;
}

const built = new Set<BuiltSite>();

// Removes the temp folder of every site that buildSite made and nobody disposed yet.
export function disposeBuiltSites(): void {
  for (const site of built) site.dispose();
}

export async function buildSite(
  fixture: string,
  integrations: AstroIntegration[],
  config: AstroInlineConfig = {},
): Promise<BuiltSite> {
  const dist = mkdtempSync(join(tmpdir(), `formgate-${fixture}-`));
  const dispose = () => rmSync(dist, { recursive: true, force: true });
  // Astro writes its prerender cache into the working directory: each fixture build runs inside its own folder,
  // so builds of two test files do not overwrite each other's cache.
  const root = resolve(projectRoot, 'tests/fixtures', fixture);
  const workingDir = process.cwd();
  try {
    process.chdir(root);
    await build({ ...config, root, outDir: dist, cacheDir: join(dist, '.cache'), logLevel: 'silent', integrations });
  } catch (error) {
    dispose();
    throw error;
  } finally {
    process.chdir(workingDir);
  }
  const site: BuiltSite = {
    root,
    dist,
    read: (path) => readFileSync(join(dist, path), 'utf8'),
    dispose: () => {
      built.delete(site);
      dispose();
    },
  };
  built.add(site);
  return site;
}
