// A fixture site with ClientRouter: the built page script binds the form of the page it loads on and the form of
// the page that ClientRouter swaps in (astro:page-load). The swap is simulated in a happy-dom window.
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import formgate from '../../src/astro/index.ts';
import { posts } from '../client/support.ts';
import { buildSite, disposeBuiltSites } from '../support/astro-site.ts';

afterAll(disposeBuiltSites);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const bodyOf = (html: string) => /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1];

it('after ClientRouter goes to the second page, its form is bound and one submit sends one request', async () => {
  const site = await buildSite('astro-router', [formgate()]);
  const first = site.read('index.html');
  const scriptSrc = /<script type="module" src="(\/_astro\/page[^"]+)"/.exec(first)![1];
  const fetchStub = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const window = new Window({ url: 'https://site.ru/' });
  Object.assign(window, { fetch: fetchStub });
  window.document.body.innerHTML = bodyOf(first);

  // The script is an ES module (the widget loads by a dynamic import); eval takes it as a plain script, so the page URL
  // stands in for import.meta.
  const script = readFileSync(join(site.dist, scriptSrc), 'utf8');
  window.eval(script.replaceAll('import.meta.resolve', 'undefined').replaceAll('import.meta.url', '"https://site.ru/"'));
  window.document.body.innerHTML = bodyOf(site.read('second/index.html'));
  window.document.dispatchEvent(new window.Event('astro:page-load'));
  window.document.querySelector('form')!.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settle();

  expect(window.document.querySelector('form')!.id).toBe('second');
  expect(posts(fetchStub)).toHaveLength(1);
  expect(posts(fetchStub)[0][0]).toBe('https://site.ru/formgate/submit.php');
}, 120_000);
