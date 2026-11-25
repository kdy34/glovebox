// T103d — the sign-in legal line said "…agree to the Terms of Use and Privacy Policy." and then
// repeated "Terms of Use · Privacy Policy" as links. It must read as one sentence with the links inline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const en = JSON.parse(readFileSync(join(root, 'src', 'i18n', 'en.json'), 'utf8'));
const signIn = readFileSync(join(root, 'app', '(auth)', 'sign-in.tsx'), 'utf8');

describe('sign-in legal line', () => {
  it('is one sentence with the two documents named once', () => {
    const sentence = `${en.auth.legalPrefix}${en.legal.terms}${en.auth.legalAnd}${en.legal.privacy}${en.auth.legalSuffix}`;
    assert.equal(sentence, 'By continuing you agree to the Terms of Use and Privacy Policy.');
    assert.equal(en.auth.legal, undefined, 'the old full-sentence string is gone');
  });
  it('the screen builds it from the parts, with the document names as the links', () => {
    for (const key of ['auth.legalPrefix', 'auth.legalAnd', 'auth.legalSuffix', 'legal.terms', 'legal.privacy']) {
      assert.ok(signIn.includes(`tr('${key}')`), `sign-in.tsx uses ${key}`);
    }
    assert.ok(!signIn.includes("tr('auth.legal')"));
    assert.ok(!signIn.includes("' · '"), 'no separate link list');
  });
});
