import { createController } from './model';
export type Scenario = 'success' | 'retry' | 'failure' | 'empty';
export function assertDisconnected(scope: object = globalThis) {
  if ('Byond' in scope || 'hubStorage' in scope) {
    throw Error('Disconnected preview refuses native host globals.');
  }
}
export const sample = {
  '2026-10-01': {
    'Sample Archivist': [
      { bugfix: 'A lantern now keeps its flame.' },
      { qol: 'Workshop recipes are easier to read.' },
      { bugfix: 'A lantern now keeps its flame.' },
    ],
  },
  '2026-10-21': {
    'Sample Cartographer': [
      { map: 'A path through the old wood.' },
      { experiment: true },
      { balance: 0 },
      {},
      { tweak: null },
      { code_imp: 'Visible note', hidden: { ignored: true } },
    ],
    'Sample Empty Group': [],
  },
  '2026-10-10': {},
};
export function sampleController(scenario: Scenario) {
  assertDisconnected();
  let attempts = 0;
  const audit: string[] = [];
  const controller = createController({
    dates: scenario === 'empty' ? [] : ['2026-10', '2026-09'],
    action(name, payload) {
      assertDisconnected();
      audit.push(`${name}: ${payload.date}`);
    },
    resolveAsset(name) {
      assertDisconnected();
      return `sample-only:${name}:${++attempts}`;
    },
    async fetch(url) {
      assertDisconnected();
      // No network APIs. JSON is a CORE-schema YAML subset.
      return {
        async text() {
          if (
            scenario === 'failure' ||
            (scenario === 'retry' && attempts < 3)
          ) {
            return 'Cannot find sample archive';
          }
          return JSON.stringify(
            url.includes('2026-09')
              ? {
                  '2026-09-04': {
                    'Sample Archivist': [{ add: 'The archive begins.' }],
                  },
                }
              : sample,
          );
        },
      };
    },
  });
  return { controller, audit };
}
