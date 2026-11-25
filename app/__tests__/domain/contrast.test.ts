// T016 — every text/background pair in the theme meets WCAG 2.1 AA (constitution VII).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio } from '../../src/ui/contrast.ts';
import { palettes, textPairs } from '../../src/ui/tokens.ts';

describe('contrastRatio', () => {
  it('matches known values', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF') * 10) / 10, 21);
    assert.equal(Math.round(contrastRatio('#777777', '#FFFFFF') * 100) / 100, 4.48);
  });
});

describe('segmented control selection (T103a)', () => {
  it('the selected segment is a filled navy with readable text', () => {
    assert.ok(textPairs.some(([fg, bg]) => fg === 'onSelected' && bg === 'selectedBg'), 'onSelected/selectedBg is in textPairs');
    assert.equal(palettes.light.selectedBg, '#0F1B2D');
    for (const mode of ['light', 'dark'] as const) {
      assert.notEqual(palettes[mode].selectedBg, 'transparent');
      assert.ok(contrastRatio(palettes[mode].onSelected, palettes[mode].selectedBg) >= 4.5, `${mode} selected text`);
    }
  });
});

for (const mode of ['light', 'dark'] as const) {
  describe(`${mode} palette`, () => {
    for (const [fg, bg, min] of textPairs) {
      it(`${fg} on ${bg} ≥ ${min}:1`, () => {
        const ratio = contrastRatio(palettes[mode][fg], palettes[mode][bg]);
        assert.ok(ratio >= min, `${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      });
    }
  });
}
