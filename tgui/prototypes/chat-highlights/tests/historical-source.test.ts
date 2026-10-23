import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { plugins, repository } from '../build-options';
import { SOURCE_SHA256, transformSource } from '../candidate-overlay';
import {
  HISTORICAL_COMMIT,
  HISTORICAL_RENDERER,
  historicalSourcePath,
  RENDERER_SOURCE,
  sourceProvenance,
} from '../historical-source';

test('historical renderer retains exact pinned bytes and MIT provenance', () => {
  const bytes = readFileSync(join(repository, HISTORICAL_RENDERER));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    SOURCE_SHA256[RENDERER_SOURCE],
  );
  expect(bytes.toString()).toContain(
    '@copyright 2020 Aleksej Komarov\n * @license MIT',
  );
  expect(HISTORICAL_COMMIT).toBe('e6f2f9265fb3059804c765fcf3eeb17202b248a8');
  expect(
    historicalSourcePath('tgui/packages/tgui-panel/chat/replaceInTextNode.js'),
  ).toBe('tgui/packages/tgui-panel/chat/replaceInTextNode.js');
});

test('current renderer drift is stale, not re-pinned or claimed measured', () => {
  const provenance = sourceProvenance(repository);
  expect(provenance.currentProductionApplicability.status).toBe(
    'stale-source-drift',
  );
  expect(
    provenance.currentProductionApplicability.measuredCurrentProduction,
  ).toBe(false);
  expect(
    provenance.sources.find((item) => item.originalPath === RENDERER_SOURCE)
      ?.actualPath,
  ).toBe(HISTORICAL_RENDERER);
  const current = readFileSync(join(repository, RENDERER_SOURCE), 'utf8');
  expect(() => transformSource(RENDERER_SOURCE, current, 'baseline')).toThrow(
    'source drift',
  );
});

test('bundler attributes historical bytes to fixture, retaining original import directory', async () => {
  const inputs = new Set<string>();
  const result = await Bun.build({
    entrypoints: [join(repository, RENDERER_SOURCE)],
    target: 'browser',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: plugins('baseline', inputs),
  });
  expect(result.success).toBe(true);
  expect(inputs.has(join(repository, HISTORICAL_RENDERER))).toBe(true);
  expect(inputs.has(join(repository, RENDERER_SOURCE))).toBe(false);
  for (const name of ['model.js', 'constants.ts', 'replaceInTextNode.js']) {
    expect(
      inputs.has(join(repository, 'tgui/packages/tgui-panel/chat', name)),
    ).toBe(true);
  }
});
