/** Historical experiment input mapping. Never imported by production. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SOURCE_SHA256 } from './candidate-overlay';

export const RENDERER_SOURCE = 'tgui/packages/tgui-panel/chat/renderer.jsx';
export const HISTORICAL_RENDERER =
  'tgui/prototypes/chat-highlights/historical/renderer.jsx.txt';
export const HISTORICAL_COMMIT = 'e6f2f9265fb3059804c765fcf3eeb17202b248a8';

export const historicalSourcePath = (path: string) =>
  path === RENDERER_SOURCE ? HISTORICAL_RENDERER : path;

const hash = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

export function sourceProvenance(repository: string) {
  const sources = Object.entries(SOURCE_SHA256).map(
    ([originalPath, expected]) => {
      const actualPath = historicalSourcePath(originalPath);
      const sha256 = hash(join(repository, actualPath));
      if (sha256 !== expected) {
        throw Error(`Historical study source drift: ${actualPath}`);
      }
      return { originalPath, actualPath, sha256 };
    },
  );
  const production = Object.entries(SOURCE_SHA256).map(([path, expected]) => ({
    path,
    expectedHistoricalSha256: expected,
    currentSha256: hash(join(repository, path)),
  }));
  return {
    study: 'historical-only',
    rendererRecoveredFrom: { commit: HISTORICAL_COMMIT, path: RENDERER_SOURCE },
    sources,
    currentProductionApplicability: {
      status: production.some(
        (item) => item.currentSha256 !== item.expectedHistoricalSha256,
      )
        ? 'stale-source-drift'
        : 'matching-pinned-sources-only',
      measuredCurrentProduction: false,
      explanation:
        'Historical results are not current production measurements. Matching these pins alone does not revalidate the complete production graph or mutation audit.',
      production,
    },
  };
}
