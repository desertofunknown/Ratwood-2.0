import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dialogScreenCss } from '../dialog-styles';

describe('owned prompt styles', () => {
  for (const [family, path] of [
    ['Selection', '../../selection-prompt/selection.css'],
    ['Value', '../../value-prompts/value.css'],
    ['Alert', '../../alert-prompt/alert.css'],
  ] as const) {
    test(`${family} retains domain rules without standalone chrome`, () => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      const scoped = dialogScreenCss(source, family);
      expect(scoped).toContain(`.SampleApplication .${family}Prompt`);
      expect(scoped).not.toMatch(
        /(?:^|[}\n])\s*(?:html|body|#root|#controls)\s*[{,]/,
      );
      expect(scoped).not.toContain(`.${family}Preview`);
      expect(scoped).not.toMatch(/@font-face|url\(/i);
    });
  }
  test('rejects foreign selectors and unknown rules rather than leaking styles', () => {
    expect(() => dialogScreenCss('.Foreign {color:red}', 'Value')).toThrow();
    expect(() =>
      dialogScreenCss('.ValuePrompt, .Foreign {color:red}', 'Value'),
    ).toThrow();
    expect(() =>
      dialogScreenCss('@font-face {font-family:x}', 'Value'),
    ).toThrow();
  });
  test('retains scoped media rules and removes empty standalone media', () => {
    const result = dialogScreenCss(
      '@media(max-width:500px){.ValuePrompt {width:100%}} @media(min-width:1px){body{margin:0}}',
      'Value',
    );
    expect(result).toContain('@media(max-width:500px)');
    expect(result).toContain('.SampleApplication .ValuePrompt');
    expect(result).not.toContain('min-width');
    expect(
      dialogScreenCss(
        '.AlertPreview, .AlertPrompt__header {padding:4px}',
        'Alert',
      ),
    ).toBe('.SampleApplication .AlertPrompt__header {padding:4px}');
  });
});
