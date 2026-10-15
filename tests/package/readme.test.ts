// The public texts: the English and the Russian README and the changelog.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const english = readFileSync('README.md', 'utf8');
const russian = readFileSync('README.ru.md', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

describe.each([
  ['README.md', english, 'README.ru.md'],
  ['README.ru.md', russian, 'README.md'],
])('%s', (_name, text, other) => {
  it('links to the other README, the integration doc and the licence', () => {
    for (const target of [other, 'docs/integration.md', 'LICENSE']) expect(text).toContain(`](${target})`);
  });

  it('shows the npm install and the install script command, and does not name the old scope', () => {
    expect(text).toContain('npm install formgate');
    expect(text).toMatch(/curl -fsSL https:\/\/raw\.githubusercontent\.com\/bolandeu\/formgate\/[^\s]+\/install\.sh \| sh/);
    expect(text).not.toContain('@bolandeu');
  });
});

describe('README language', () => {
  it('README.md is English and README.ru.md is Russian', () => {
    const cyrillic = (text: string) => (text.match(/[а-яё]/gi) ?? []).length;
    // README.md may name the Russian docs and link the Russian README, nothing more.
    expect(cyrillic(english.replace('Русский', ''))).toBe(0);
    expect(cyrillic(russian)).toBeGreaterThan(300);
  });
});

describe('CHANGELOG.md', () => {
  it('keeps every release heading', () => {
    const versions = [...changelog.matchAll(/^## v(\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}$/gm)].map((match) => match[1]);
    // New releases go on top; the releases up to v0.10.1 stay below them, in this order.
    const kept = [
      '0.10.1', '0.10.0', '0.9.2', '0.9.1', '0.9.0', '0.8.0', '0.7.0', '0.6.1', '0.6.0', '0.5.0', '0.4.6', '0.4.5',
      '0.4.4', '0.4.3', '0.4.2', '0.4.1', '0.4.0', '0.3.0', '0.2.0', '0.1.5', '0.1.4', '0.1.3', '0.1.2', '0.1.1', '0.1.0',
    ];
    expect(versions.slice(-kept.length)).toEqual(kept);
  });
});
