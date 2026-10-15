// What `npm pack` puts in the published package and what package.json promises: exports, Lite with its vendor,
// the PHPMailer licence, the optional astro peer dependency, and no Pro files.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface PackResult {
  filename: string;
  files: { path: string }[];
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
let packed: string[] = [];
let tarball = '';
let packFolder = '';

// Packs for real into a temp folder; the global setup has built dist/ and lite/formgate.js already.
beforeAll(() => {
  packFolder = mkdtempSync(join(tmpdir(), 'formgate-pack-'));
  const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packFolder], { encoding: 'utf8' });
  // npm prints a list, or an object keyed by package name in newer versions.
  const parsed = JSON.parse(output) as PackResult[] | Record<string, PackResult>;
  const result = Object.values(parsed)[0];
  tarball = result.filename;
  packed = result.files.map((file) => file.path);
}, 120_000);

afterAll(() => rmSync(packFolder, { recursive: true, force: true }));

const readFromTarball = (path: string) => execFileSync('tar', ['-xOf', join(packFolder, tarball), `package/${path}`], { encoding: 'utf8' });

describe('published package', () => {
  it('is the tarball formgate-<version>.tgz under the MIT licence', () => {
    expect(manifest.name).toBe('formgate');
    expect(manifest.license).toBe('MIT');
    expect(tarball).toBe(`formgate-${manifest.version}.tgz`);
  });

  it('carries the MIT licence file of bolandeu for 2026, the English README, dist and lite', () => {
    const licence = readFromTarball('LICENSE').split('\n');
    expect(licence[0]).toBe('MIT License');
    expect(licence).toContain('Copyright (c) 2026 bolandeu');
    expect(packed).toContain('README.md');
    expect(packed.some((path) => path.startsWith('dist/'))).toBe(true);
    expect(packed.some((path) => path.startsWith('lite/'))).toBe(true);
  });

  it('exports ./client, ./client/pow-widget, ./astro and ./lite/*, and the files they point at are in the tarball', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(['./astro', './client', './client/pow-widget', './lite/*']);
    expect(packed).toContain(manifest.exports['./client/pow-widget'].default.slice(2));
    expect(packed).toContain(manifest.exports['./client'].default.slice(2));
    expect(packed).toContain(manifest.exports['./astro'].default.slice(2));
    expect(packed).toContain('lite/submit.php');
    expect(packed).toContain('lite/formgate.js');
  });

  it('holds the ALTCHA widget as a separate file: the main client and formgate.js do not contain it', () => {
    const widgetMarker = 'altcha-widget';
    expect(packed).toContain('lite/formgate-pow-widget.js');
    expect(readFromTarball('lite/formgate-pow-widget.js')).toContain(widgetMarker);
    expect(readFromTarball('dist/client/pow-widget.js')).toContain(widgetMarker);
    expect(readFromTarball('lite/formgate.js')).not.toContain(widgetMarker);
    for (const path of ['index', 'bind-form', 'token', 'pow']) {
      expect(readFromTarball(`dist/client/${path}.js`)).not.toContain(widgetMarker);
    }
  });

  it('carries lite/vendor/phpmailer with its licence', () => {
    expect(packed).toContain('lite/vendor/phpmailer/phpmailer/src/PHPMailer.php');
    expect(packed).toContain('lite/vendor/phpmailer/phpmailer/LICENSE');
  });

  it('has no Pro files', () => {
    expect(packed.filter((path) => path.startsWith('pro/'))).toEqual([]);
  });

  it('has astro as an optional peer dependency', () => {
    expect(Object.keys(manifest.peerDependencies)).toEqual(['astro']);
    expect(manifest.peerDependenciesMeta.astro).toEqual({ optional: true });
  });
});
