// Build fixture Astro sites with formgate() and read what lands in dist/.
import { Window } from 'happy-dom';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import formgate from '../../src/astro/index.ts';
import { buildSite, type BuiltSite } from '../support/astro-site.ts';

function page(site: BuiltSite, path = 'index.html') {
  const window = new Window({ url: 'https://site.ru/' });
  window.document.write(site.read(path));
  return window.document;
}

const formAction = (site: BuiltSite) => page(site).querySelector('form')!.getAttribute('action');

describe('astro integration', () => {
  it('without endpoint: copies the Lite folder with submit.php and vendor, the form action is the Lite handler URL', async () => {
    const site = await buildSite('astro-basic', [formgate()]);

    expect(existsSync(join(site.dist, 'formgate/submit.php'))).toBe(true);
    expect(existsSync(join(site.dist, 'formgate/vendor/autoload.php'))).toBe(true);
    expect(existsSync(join(site.dist, 'formgate/formgate.js'))).toBe(false);
    expect(formAction(site)).toBe('/formgate/submit.php');
  }, 120_000);

  it('bind: false: no page script, the Lite folder is still in dist, the form action is the Lite handler URL', async () => {
    const site = await buildSite('astro-basic', [formgate({ bind: false })]);

    expect(page(site).querySelectorAll('script')).toHaveLength(0);
    expect(existsSync(join(site.dist, 'formgate/submit.php'))).toBe(true);
    expect(formAction(site)).toBe('/formgate/submit.php');
  }, 120_000);

  it('bind: true: every page has the client script', async () => {
    const site = await buildSite('astro-basic', [formgate({ bind: true })]);

    expect(page(site).querySelectorAll('script')).toHaveLength(1);
  }, 120_000);

  it('with base:the form action is the Lite handler URL under the base', async () => {
    const site = await buildSite('astro-basic', [formgate()], { base: '/sub' });

    expect(existsSync(join(site.dist, 'formgate/submit.php'))).toBe(true);
    expect(formAction(site)).toBe('/sub/formgate/submit.php');
  }, 120_000);

  it('with endpoint: no Lite folder in dist, the form action is the endpoint', async () => {
    const site = await buildSite('astro-basic', [formgate({ endpoint: 'https://pro.example/f/key' })]);

    expect(existsSync(join(site.dist, 'formgate'))).toBe(false);
    expect(formAction(site)).toBe('https://pro.example/f/key');
  }, 120_000);

  it('declares the types of virtual:formgate for the site', async () => {
    const site = await buildSite('astro-basic', [formgate()]);

    const types = readFileSync(join(site.root, '.astro/integrations/formgate/virtual.d.ts'), 'utf8');
    expect(types).toContain("declare module 'virtual:formgate'");
  }, 120_000);

  it('added twice: the build passes, Lite is copied once, no extra pages, routes or CSS', async () => {
    const once = await buildSite('astro-basic', [formgate()]);
    const twice = await buildSite('astro-basic', [formgate(), formgate()]);

    const files = (dist: string) => readdirSync(dist, { recursive: true, encoding: 'utf8' }).sort();
    expect(files(twice.dist)).toEqual(files(once.dist));
    expect(files(twice.dist).filter((file) => file.endsWith('.html'))).toEqual(['index.html']);
    expect(files(twice.dist).filter((file) => file.endsWith('.css'))).toEqual([]);
    expect(files(twice.dist).filter((file) => file === 'formgate/submit.php')).toHaveLength(1);
    expect(page(twice).querySelectorAll('script')).toHaveLength(1);
  }, 180_000);
});
