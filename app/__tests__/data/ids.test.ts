// T102 — client ids come from expo-crypto's randomUUID, never the `uuid` package.
// `uuid` v4 calls crypto.getRandomValues(), which Hermes doesn't provide, so every
// vehicle / odometer / record save threw before it reached Supabase.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('client id generation', () => {
  it('no app source imports the uuid package', () => {
    const offenders = [...sources(join(root, 'src')), ...sources(join(root, 'app'))].filter((f) =>
      /from ['"]uuid['"]|require\(['"]uuid['"]\)/.test(readFileSync(f, 'utf8')),
    );
    assert.deepEqual(offenders, []);
  });

  it('uuid is not a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const field of ['dependencies', 'devDependencies']) {
      assert.equal(pkg[field]?.uuid, undefined, `${field}.uuid`);
      assert.equal(pkg[field]?.['@types/uuid'], undefined, `${field}.@types/uuid`);
    }
  });

  it('newId() wraps expo-crypto randomUUID', () => {
    const src = readFileSync(join(root, 'src', 'data', 'ids.ts'), 'utf8');
    assert.match(src, /from 'expo-crypto'/);
    assert.match(src, /randomUUID\(\)/);
  });
});
