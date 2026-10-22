import { expect, test } from 'bun:test';
import { createMarketController } from '../model';
import { MARKET_SAMPLES, getPreviewResponse } from '../fixtures';
import {
  deriveTradeQuoteState,
  computeFillTarget,
} from '../../../packages/tgui/interfaces/StewardTrade/tradeQuote';
import { groupByCategory } from '../../../packages/tgui/interfaces/StewardTrade/helpers';
import type { TradeQuote } from '../../../packages/tgui/interfaces/StewardTrade/types';
const request = { side: 'import' as const, regionId: 'north', goodId: 'wheat' };
function open(sample = 'best-regions') {
  const c = createMarketController(sample);
  c.openQuote(request);
  return c;
}
function parity(c: ReturnType<typeof createMarketController>) {
  const s = c.snapshot();
  expect(s.groups).toEqual(
    groupByCategory(s.data.market_rows, s.data.good_catalog),
  );
  if (s.request)
    expect(s.quoteState).toEqual(
      deriveTradeQuoteState({
        request: s.request,
        draft: s.draft,
        serverResponse: s.serverResponse,
        lastResponse: s.lastResponse,
        sequestered: s.data.sequestration.active,
      }),
    );
}
test('all samples use actual source grouping, IDs and source derivation', () => {
  for (const sample of MARKET_SAMPLES) {
    const c = open(sample.id);
    parity(c);
    c.deliverPreview();
    parity(c);
    c.dispose();
  }
  const s = open().snapshot();
  expect(s.groups.map((g) => g.category)).toEqual([
    'grain',
    'basic_mineral',
    'gem_rare',
  ]);
  expect(s.groups.flatMap((g) => g.rows.map((r) => r.good_id))).toEqual([
    'wheat',
    'iron',
    'ruby',
  ]);
  expect(s.data.market_rows[0].import_regions.map((r) => r.region_id)).toEqual([
    'north',
    'east',
  ]);
  expect(s.data.market_rows[0].export_regions.map((r) => r.region_id)).toEqual([
    'south',
    'north',
  ]);
});
test('opening and editing cannot generate a quote; arbitrary quantity receives explicit refusal, never computed price', () => {
  const c = open();
  expect(c.snapshot().serverResponse).toBeNull();
  c.setQuantity('7');
  expect(c.snapshot().serverResponse).toBeNull();
  c.deliverPreview();
  expect(c.snapshot().quoteState?.quote).toBeNull();
  expect(c.snapshot().quoteState?.issue).toContain('No recorded quote');
  parity(c);
});
for (const field of [
  'request_id',
  'side',
  'region_id',
  'good_id',
  'quantity',
] as const)
  test(`stale ${field} cannot replace accepted current response`, () => {
    const c = open();
    c.deliverPreview();
    const accepted = c.snapshot().lastResponse!;
    const mismatch = {
      request_id: 'old',
      side: 'export',
      region_id: 'east',
      good_id: 'iron',
      quantity: 2,
    };
    c.deliver({ ...accepted, [field]: mismatch[field] } as TradeQuote);
    expect(c.snapshot().quoteState?.quote).toEqual(accepted);
    parity(c);
  });
test('old details survive a changed draft but do not constitute a current quote; rejection takes precedence', () => {
  const c = open();
  c.deliverPreview();
  const old = c.snapshot().lastResponse;
  c.setQuantity('10');
  expect(c.snapshot().quoteState).toMatchObject({
    quote: null,
    details: old,
    submitDisabled: true,
  });
  c.deliverPreview();
  c.deliverPreview('rejected');
  expect(c.snapshot().quoteState).toMatchObject({
    quote: null,
    submitDisabled: true,
  });
  expect(c.snapshot().quoteState?.issue).toContain('Sample server rejected');
  parity(c);
});
for (const raw of [
  '',
  ' ',
  '0',
  '-1',
  '1.5',
  '51',
  'Infinity',
  'NaN',
  '9007199254740992',
])
  test(`raw quantity ${JSON.stringify(raw)} remains invalid and unquoted`, () => {
    const c = open();
    c.setQuantity(raw);
    c.deliverPreview();
    expect(c.snapshot().draft.text).toBe(raw);
    expect(c.snapshot().serverResponse).toBeNull();
    expect(c.snapshot().quoteState).toMatchObject({
      validQuantity: false,
      submitDisabled: true,
    });
    parity(c);
  });
test('purse, warrant, stockpile, sequestration and export affordability follow production helper', () => {
  for (const [sample, issue] of [
    ['insufficient-purse', 'Treasury cannot cover'],
    ['insufficient-warrant', 'Warrant cannot cover'],
    ['sequestration', 'Commerce is in sequestration'],
  ]) {
    const c = open(sample);
    c.deliverPreview();
    expect(c.snapshot().quoteState?.issue).toContain(issue);
    parity(c);
  }
  const c = createMarketController('insufficient-purse');
  c.openQuote({ ...request, side: 'export', regionId: 'south' });
  c.setQuantity('1');
  c.deliverPreview();
  expect(c.snapshot().quoteState?.issue).toBe('');
  parity(c);
  c.selectSample('empty-stockpile');
  c.openQuote({ ...request, side: 'export', regionId: 'south' });
  c.deliverPreview();
  expect(c.snapshot().quoteState?.issue).toBe(
    'Nothing in the stockpile to sell.',
  );
  parity(c);
});
test('fill values are actual source helper values and fill invalidates correlation', () => {
  const base = MARKET_SAMPLES[0].quotes[0];
  for (const [change, target] of [
    [{}, 20],
    [{ max_units: 8 }, 8],
    [{ balance: 95 }, 9],
    [{ is_alderman_acting: true, warrant_remaining: 65 }, 6],
    [{ batch_capacity: 3.9 }, 3],
    [{ side: 'export', stockpile_amount: 7, balance: 0 }, 7],
    [{ batch_capacity: 0 }, 0],
  ] as [Partial<TradeQuote>, number][])
    expect(computeFillTarget({ ...base, ...change })).toBe(target);
  const c = open();
  c.deliverPreview();
  const id = c.snapshot().draft.id;
  c.fillQuantity();
  expect(c.snapshot().draft.text).toBe('20');
  expect(c.snapshot().draft.id).not.toBe(id);
  expect(c.snapshot().quoteState?.quote).toBeNull();
  parity(c);
});
test('sequestration invalidates accepted quote; unlock never restores authorization; close/reopen and dispose are inert', () => {
  const c = open();
  c.deliverPreview();
  const old = c.snapshot().lastResponse!;
  c.setSequestered(true);
  const locked = c.snapshot().draft;
  c.setQuantity('10');
  expect(c.snapshot().draft).toEqual(locked);
  c.setSequestered(false);
  expect(c.snapshot().quoteState?.quote).toBeNull();
  c.closeQuote();
  c.openQuote(request);
  c.deliver(old);
  expect(c.snapshot().quoteState?.quote).toBeNull();
  let notices = 0;
  c.subscribe(() => notices++);
  c.dispose();
  c.setQuantity('10');
  c.openQuote(request);
  c.deliver(old);
  expect(notices).toBe(0);
  expect(c.snapshot().request).toBeNull();
});
test('every public mutation rejects native globals before acting, including late attachment', () => {
  const c = open();
  for (const scope of [globalThis, window])
    for (const key of ['Byond', 'hubStorage']) {
      Object.defineProperty(scope, key, {
        value: undefined,
        configurable: true,
      });
      try {
        expect(() => createMarketController()).toThrow();
        expect(() => c.deliverPreview()).toThrow();
        expect(() => c.setQuantity('2')).toThrow();
        expect(() => c.openQuote(request)).toThrow();
      } finally {
        Reflect.deleteProperty(scope, key);
      }
    }
});
test('export first correlated success fills once, requires explicit next delivery, and respects manual edits', () => {
  const c = createMarketController();
  c.openQuote({ ...request, side: 'export', regionId: 'south' });
  const initial = c.snapshot().draft.id;
  c.deliverPreview('stale');
  expect(c.snapshot().draft.text).toBe('1');
  c.deliverPreview();
  expect(c.snapshot().draft.text).toBe('20');
  expect(c.snapshot().draft.id).not.toBe(initial);
  expect(c.snapshot().quoteState?.quote).toBeNull();
  parity(c);
  c.deliverPreview();
  expect(c.snapshot().quoteState?.quote?.quantity).toBe(20);
  parity(c);
  c.closeQuote();
  c.openQuote({ ...request, side: 'export', regionId: 'south' });
  c.setQuantity('10');
  c.deliverPreview();
  expect(c.snapshot().draft.text).toBe('10');
  expect(c.snapshot().quoteState?.quote?.quantity).toBe(10);
  parity(c);
});
