import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';
import { parse } from 'postcss';

import { archiveScreenCss } from '../archive-styles';

test('scopes the actual archive rules without standalone chrome', () => {
  const source = readFileSync(
    new URL('../../changes-archive/archive.css', import.meta.url),
    'utf8',
  );
  const result = parse(archiveScreenCss(source));
  let rules = 0;
  result.walkRules((rule) => {
    rules++;
    expect(
      rule.selectors.every((selector) =>
        selector.startsWith('.SampleApplication .ChangesArchive'),
      ),
    ).toBe(true);
  });
  expect(rules).toBe(22);
  expect(result.toString()).not.toContain('PreviewControls');
});

test('preserves domain declarations and responsive media conditions', () => {
  const result = parse(
    archiveScreenCss(
      '@media (max-width: 560px) { .ChangesArchive { padding: 8px; } }',
    ),
  );
  expect(result.first?.type).toBe('atrule');
  expect(result.toString()).toContain('(max-width: 560px)');
  expect(result.toString()).toContain('padding: 8px');
});

test('drops empty chrome-only media blocks', () => {
  expect(
    archiveScreenCss('@media (max-width: 560px) { body { margin: 0; } }'),
  ).toBe('');
});

test('rejects unknown and mixed selectors rather than leaking styles', () => {
  for (const selector of ['button', '.Other', '.ChangesArchive, body']) {
    expect(() => archiveScreenCss(`${selector} { color: red; }`)).toThrow(
      'Unreviewed archive selector',
    );
  }
});

test('rejects unreviewed at-rules', () => {
  expect(() => archiveScreenCss('@font-face { font-family: test; }')).toThrow(
    'Unreviewed archive at-rule',
  );
});
