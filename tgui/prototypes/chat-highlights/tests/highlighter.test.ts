import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'bun:test';
import { SOURCE_SHA256, transformSource } from '../candidate-overlay';
const repo = resolve(import.meta.dir, '../../../..');
const helperPath = 'tgui/packages/tgui-panel/chat/replaceInTextNode.js';
const source = await readFile(resolve(repo, helperPath), 'utf8');
const temp = await mkdtemp('/tmp/chat-highlight-helpers-');
afterAll(() => rm(temp, { recursive: true, force: true }));
await writeFile(
  `${temp}/baseline.mjs`,
  transformSource(helperPath, source, 'baseline'),
);
await writeFile(
  `${temp}/candidate.mjs`,
  transformSource(helperPath, source, 'candidate'),
);
const baseline = await import(`${temp}/baseline.mjs`);
const candidate = await import(`${temp}/candidate.mjs`);
const element = (html: string) => {
  const node = document.createElement('div');
  node.innerHTML = html;
  return node;
};
const factory = (text: string) => {
  const node = document.createElement('mark');
  node.textContent = text;
  return node;
};
test('overlay pins production files and rejects drift, repeat application and invalid variants', async () => {
  for (const path of Object.keys(SOURCE_SHA256)) {
    const original = await readFile(resolve(repo, path), 'utf8');
    expect(transformSource(path, original, 'baseline')).toBe(original);
    expect(() => transformSource(path, original + '\n', 'candidate')).toThrow(
      'source drift',
    );
    expect(() =>
      transformSource(
        path,
        transformSource(path, original, 'candidate'),
        'candidate',
      ),
    ).toThrow('source drift');
    expect(() => transformSource(path, original, 'typo' as any)).toThrow(
      'variant',
    );
  }
  expect(() => transformSource('other.js', source, 'candidate')).toThrow(
    'Unsupported',
  );
});
const cases: Array<[string, string | null, string, string[] | null, string[]]> =
  [
    [
      'words only',
      null,
      'g',
      ['warden'],
      ['warden !', ' warden !', 'quiet', 'warden !'],
    ],
    [
      'regex repeated lastIndex',
      'warden',
      'gi',
      null,
      ['warden WARDEN', 'warden', 'quiet', 'warden'],
    ],
    [
      'mixed secondary pass',
      'bell',
      'gi',
      ['warden'],
      ['warden ! bell', 'bell warden !', 'quiet'],
    ],
    [
      'null primary with words',
      null,
      'g',
      ['warden'],
      ['warden !', '<i>warden !</i>'],
    ],
    ['empty', 'warden', 'g', [], ['', '<b></b>']],
    ['zero length', '(?:)', 'g', [], ['warden', '', '<b>bell</b>']],
    ['zero and nonzero', 'x*', 'g', [], ['xx y x', 'x', 'z']],
    [
      'punctuation',
      'foo\\-bar',
      'gi',
      ['foo\\-bar'],
      ['FOO-bar ! foo-bar', '<i>foo-bar</i>'],
    ],
    ['Cyrillic', 'ёжик', 'gi', ['ёжик'], ['ЁЖИК ёжик', 'ёжик !']],
    [
      'word boundary',
      '\\bwarden\\b',
      'gi',
      ['warden'],
      ['wardens WARDEN _warden warden!'],
    ],
    [
      'case sensitive primary',
      'WARDEN',
      'g',
      ['WARDEN'],
      ['warden WARDEN', 'warden !'],
    ],
    [
      'nested original-child traversal',
      'warden|bell',
      'gi',
      null,
      [
        'warden<b>bell<i>warden</i> bell</b>warden',
        '<a href="#inert">warden</a>',
      ],
    ],
  ];
for (const [name, pattern, flags, words, samples] of cases) {
  test(`happyDOM actual-helper differential: ${name}`, () => {
    const aRegex = pattern === null ? null : new RegExp(pattern, flags);
    const bRegex = pattern === null ? null : new RegExp(pattern, flags);
    const prepared = candidate.prepareHighlightNode(bRegex, words, factory);
    for (const html of samples) {
      if (aRegex) aRegex.lastIndex = 37;
      if (bRegex) bRegex.lastIndex = 37;
      const a = element(html),
        b = element(html);
      expect(prepared(b)).toBe(
        baseline.highlightNode(a, aRegex, words, factory),
      );
      expect(b.outerHTML).toBe(a.outerHTML);
      if (aRegex) expect(bRegex!.lastIndex).toBe(aRegex.lastIndex);
    }
  });
}
test('null node factory defaults and creates distinct nodes each call', () => {
  const prepared = candidate.prepareHighlightNode(/warden/g, null, null);
  const a = element('warden'),
    b = element('warden'),
    c = element('warden');
  baseline.highlightNode(a, /warden/g, null, null);
  prepared(b);
  prepared(c);
  expect(b.outerHTML).toBe(a.outerHTML);
  expect(c.outerHTML).toBe(a.outerHTML);
  expect(b.firstChild).not.toBe(c.firstChild);
});
test('invalid secondary regex throws lazily on first use and repeated use', () => {
  const prepared = candidate.prepareHighlightNode(null, ['['], factory);
  expect(() =>
    baseline.highlightNode(element('x'), null, ['['], factory),
  ).toThrow();
  expect(() =>
    baseline.highlightNode(element(''), null, ['['], factory),
  ).toThrow();
  expect(() => prepared(element(''))).toThrow();
  expect(() => prepared(element('x'))).toThrow();
  expect(() => prepared(element('x'))).toThrow();
});
test('safety ceiling retains original text and reports no committed replacements', () => {
  // Non-global non-empty regex exercises existing 9999 iteration guard.
  const a = element('x'),
    b = element('x');
  expect(baseline.highlightNode(a, /x/, null, factory)).toBe(0);
  expect(candidate.prepareHighlightNode(/x/, null, factory)(b)).toBe(0);
  expect(b.outerHTML).toBe(a.outerHTML);
  expect(b.innerHTML).toBe('x');
});
test('overlapping groups retain identical nesting', () => {
  const a = element('warden bell'),
    b = element('warden bell');
  for (const pattern of ['warden', 'ward|bell']) {
    baseline.highlightNode(a, new RegExp(pattern, 'g'), null, factory);
    candidate.prepareHighlightNode(new RegExp(pattern, 'g'), null, factory)(b);
  }
  expect(b.outerHTML).toBe(a.outerHTML);
  expect(b.querySelectorAll('mark mark').length).toBe(1);
});
test('source inspection: prepared closure retains callback, not message nodes', () => {
  const body = transformSource(helperPath, source, 'candidate')
    .split('export const prepareHighlightNode = (')[1]
    .split('// Linkify')[0];
  expect(body).toContain('let replaceText;');
  expect(body).toContain('return (node) =>');
  expect(body).toContain('return replaceChildText(node, replaceText);');
  expect(body).not.toMatch(
    /(?:Map|Set|WeakMap|WeakSet|push\(|\.node\s*=|lastNode|cachedNode)/,
  );
  // In real helper callback nodes/fragments are invocation-local. This is static
  // inspection, not a GC/heap-retention measurement.
  expect(source).toContain('return (node) => {\n    let nodes;');
});

test('global safety cap followed by normal message resets cached regex state', () => {
  const primary = /x/g;
  const prepared = candidate.prepareHighlightNode(primary, null, factory);
  for (const input of ['x'.repeat(10000), 'x', 'quiet', 'x x']) {
    const a = element(input),
      b = element(input);
    expect(prepared(b)).toBe(baseline.highlightNode(a, /x/g, null, factory));
    expect(b.outerHTML).toBe(a.outerHTML);
    expect(primary.lastIndex).toBe(0);
  }
});
