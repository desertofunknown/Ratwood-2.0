import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const loader = require('./svelte-loader.cjs');
const { compile } = require('svelte/compiler');

test('existing components compile identically to the pinned official API', async () => {
  for (const name of ['Delivery.svelte', 'Workbench.svelte']) {
    const filename = fileURLToPath(new URL(`../${name}`, import.meta.url));
    const source = await readFile(filename, 'utf8');
    const expected = compile(source, {
      filename,
      generate: 'client',
      dev: false,
      css: 'external',
      runes: true,
    });
    assert.equal(
      loader.call({ resourcePath: filename }, source),
      expected.js.code,
    );
  }
});

test('warnings fail rather than being hidden', () => {
  assert.throws(
    () =>
      loader.call(
        { resourcePath: '/test/Warning.svelte' },
        '<img src="x.png">',
      ),
    /a11y_missing_attribute/,
  );
});

test('component CSS cannot silently escape the shared stylesheet boundary', () => {
  assert.throws(
    () =>
      loader.call(
        { resourcePath: '/test/Style.svelte' },
        '<div class="x">x</div><style>.x { color: red; }</style>',
      ),
    /exact shared external CSS/,
  );
});

test('invalid Svelte fails at compile time without evaluating it', () => {
  assert.throws(() =>
    loader.call({ resourcePath: '/test/Invalid.svelte' }, '{#if}'),
  );
});
