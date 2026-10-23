import { createController, type Dependencies } from './model';
export type Scenario = 'success' | 'retry' | 'failure' | 'empty';
export type SampleOptions = Pick<Dependencies, 'schedule' | 'cancel'> & {
  /** Deterministic test delivery only; the default never uses a network API. */
  fetch?: Dependencies['fetch'];
};
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
export const olderSample = {
  '2026-09-04': {
    'Sample Archivist': [{ add: 'The archive begins.' }],
  },
};
export function sampleController(
  scenario: Scenario,
  options: SampleOptions = {},
  validateBoundary: () => void = assertDisconnected,
) {
  validateBoundary();
  let attempts = 0;
  const audit: string[] = [];
  const fetchSample: Dependencies['fetch'] = async (url) => ({
    async text() {
      // No network APIs. JSON is a CORE-schema YAML subset.
      if (scenario === 'failure' || (scenario === 'retry' && attempts < 3)) {
        return 'Cannot find sample archive';
      }
      return JSON.stringify(url.includes('2026-09') ? olderSample : sample);
    },
  });
  const controller = createController({
    schedule: options.schedule,
    cancel: options.cancel,
    dates: scenario === 'empty' ? [] : ['2026-10', '2026-09'],
    action(name, payload) {
      validateBoundary();
      audit.push(`${name}: ${payload.date}`);
    },
    resolveAsset(name) {
      validateBoundary();
      return `sample-only:${name}:${++attempts}`;
    },
    async fetch(url) {
      validateBoundary();
      const response = await (options.fetch ?? fetchSample)(url);
      validateBoundary();
      return {
        async text() {
          validateBoundary();
          const text = await response.text();
          validateBoundary();
          return text;
        },
      };
    },
  });
  return { controller, audit };
}
