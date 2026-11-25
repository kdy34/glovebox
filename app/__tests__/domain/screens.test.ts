// T103b — every stack screen has a real, translated title (which iOS also uses as the next
// screen's back label). Route names like "vehicle/new" or "(tabs)" must never be shown, and a
// screen must not repeat its header title as an in-page heading.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { STACK_TITLES, TAB_TITLES } from '../../src/navigation/screens.ts';

const appDir = join(import.meta.dirname, '..', '..', 'app');
const en = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'src', 'i18n', 'en.json'), 'utf8'));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const routeFiles = files(appDir).filter((f) => f.endsWith('.tsx') && !f.endsWith('_layout.tsx') && !f.includes('/_'));
const stackRoutes = routeFiles
  .map((f) => relative(appDir, f).replace(/\.tsx$/, ''))
  .filter((r) => !r.startsWith('(tabs)/'));
const tabRoutes = routeFiles
  .map((f) => relative(appDir, f).replace(/\.tsx$/, ''))
  .filter((r) => r.startsWith('(tabs)/'))
  .map((r) => r.slice('(tabs)/'.length));

const translate = (key: string): unknown => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);

describe('stack screen titles', () => {
  it('every stack route and the tab group have a title', () => {
    for (const r of [...stackRoutes, '(tabs)']) {
      if (r === '(tabs)') continue; // titled per focused tab, below
      assert.ok(r in STACK_TITLES, `missing title for route "${r}"`);
    }
    assert.deepEqual(Object.keys(STACK_TITLES).sort(), [...stackRoutes].sort(), 'no titles for routes that no longer exist');
  });

  it('every tab has a title, used as the back label of screens pushed from it', () => {
    assert.deepEqual(Object.keys(TAB_TITLES).sort(), [...tabRoutes].sort());
  });

  it('every title key exists in en.json and is not a route name', () => {
    for (const key of [...Object.values(STACK_TITLES), ...Object.values(TAB_TITLES)]) {
      const text = translate(key);
      assert.equal(typeof text, 'string', `en.json has no "${key}"`);
      assert.doesNotMatch(text as string, /[/()[\]]/, `"${key}" looks like a route name`);
    }
  });

  it('the root layout registers every stack route with its title', () => {
    const layout = readFileSync(join(appDir, '_layout.tsx'), 'utf8');
    assert.match(layout, /STACK_TITLES/);
    assert.match(layout, /tabTitleKey/);
  });

  it('no screen repeats its header title as an in-page heading', () => {
    for (const [route, key] of Object.entries(STACK_TITLES)) {
      const sources = [join(appDir, `${route}.tsx`)];
      if (route.startsWith('record/')) sources.push(join(appDir, 'record', '_form.tsx'));
      for (const f of sources) {
        const src = readFileSync(f, 'utf8');
        const dup = src.split('\n').find((l) => /<Text\b/.test(l) && l.includes(`'${key}'`));
        assert.equal(dup, undefined, `${relative(appDir, f)} repeats "${key}" in the page: ${dup?.trim()}`);
      }
    }
    // The record form chooses its title with a ternary; the heading must be gone too.
    assert.doesNotMatch(readFileSync(join(appDir, 'record', '_form.tsx'), 'utf8'), /<Text[^>]*>\{recordId \? tr\('record\.editTitle'\)/);
  });
});
