import { expect, test } from 'bun:test';

import {
  computeFillTarget,
  deriveTradeQuoteState,
  type TradeModalRequest,
} from '../interfaces/StewardTrade/tradeQuote';
import type { TradeQuote } from '../interfaces/StewardTrade/types';

const request: TradeModalRequest = {
  side: 'import',
  regionId: 'north',
  goodId: 'wheat',
};
const draft = { text: '1', id: 'current' };
const quote = (overrides: Partial<TradeQuote> = {}): TradeQuote => ({
  request_id: 'current',
  ok: true,
  reason: '',
  side: 'import',
  region_id: 'north',
  good_id: 'wheat',
  region_name: 'Northern March',
  good_name: 'Wheat',
  quantity: 1,
  max_units: 50,
  daily_pace: 20,
  batch_capacity: 20,
  capacity_today: 20,
  capacity_total: 40,
  base_unit_price: 10,
  base_subtotal: 10,
  escalation_subtotal: 0,
  total: 10,
  balance: 1000,
  balance_after: 990,
  is_blockaded: false,
  is_alderman_acting: false,
  warrant_remaining: -1,
  warrant_ok: true,
  can_afford: true,
  stockpile_amount: 30,
  stockpile_after: 31,
  ...overrides,
});
const state = (
  overrides: Partial<Parameters<typeof deriveTradeQuoteState>[0]> = {},
) =>
  deriveTradeQuoteState({
    request,
    draft,
    serverResponse: quote(),
    lastResponse: null,
    sequestered: false,
    ...overrides,
  });

test.each([
  [{}, 20],
  [{ max_units: 8 }, 8],
  [{ batch_capacity: 3.9 }, 3],
  [{ batch_capacity: 0 }, 0],
  [{ batch_capacity: -2 }, 0],
  [{ balance: 95 }, 9],
  [{ balance: 0 }, 0],
  [{ balance: 95, is_alderman_acting: true, warrant_remaining: 65 }, 6],
  [{ is_alderman_acting: true, warrant_remaining: 0 }, 0],
  [{ is_alderman_acting: true, warrant_remaining: -1 }, 20],
  [{ is_alderman_acting: false, warrant_remaining: 0 }, 20],
  [{ base_unit_price: 0, balance: 0 }, 20],
  [{ side: 'export', stockpile_amount: 7, balance: 0 }, 7],
  [{ side: 'export', stockpile_amount: 0 }, 0],
  [{ ok: false }, 0],
] as [Partial<TradeQuote>, number][])(
  'fill target preserves shipment, stockpile, purse and warrant limits: %j',
  (overrides, expected) => {
    expect(computeFillTarget(quote(overrides))).toBe(expected);
  },
);

test('missing quote cannot offer a fill target', () => {
  expect(computeFillTarget(null)).toBe(0);
  expect(state({ serverResponse: null })).toMatchObject({
    response: null,
    quote: null,
    details: null,
    maxUnits: 50,
    canFill: false,
    submitDisabled: true,
    issue: 'Calculating current quote…',
    fillTooltip: 'Waiting for the current quote.',
  });
});

test.each([
  '',
  ' ',
  '0',
  '-1',
  '1.5',
  '51',
  'Infinity',
  'NaN',
  '9007199254740992',
])('invalid quantity %j stays unquotable and unconfirmable', (text) => {
  expect(state({ draft: { ...draft, text } })).toMatchObject({
    validQuantity: false,
    submitDisabled: true,
    issue: 'Enter a whole quantity from 1 to 50.',
  });
});

test.each([
  ['1.0', 1],
  ['1e1', 10],
  ['50', 50],
] as const)(
  'whole numeric notation %s retains its meaning',
  (text, quantity) => {
    expect(
      state({ draft: { ...draft, text }, serverResponse: quote({ quantity }) }),
    ).toMatchObject({
      quantity,
      wholeQuantity: true,
      validQuantity: true,
      submitDisabled: false,
    });
  },
);

test.each([
  { request_id: 'old' },
  { side: 'export' },
  { region_id: 'south' },
  { good_id: 'iron' },
  { quantity: 2 },
] as Partial<TradeQuote>[])(
  'mismatched response %j cannot replace the current accepted quote',
  (mismatch) => {
    const accepted = quote({ total: 12 });
    const result = state({
      serverResponse: quote(mismatch),
      lastResponse: accepted,
    });
    expect(result.response).toBe(accepted);
    expect(result.quote).toBe(accepted);
    expect(result.submitDisabled).toBe(false);
  },
);

test('old details stay visible without authorizing a new draft', () => {
  const previous = quote();
  expect(
    state({ draft: { text: '2', id: 'next' }, lastResponse: previous }),
  ).toMatchObject({
    response: null,
    quote: null,
    details: previous,
    submitDisabled: true,
  });
});

test('current rejection takes precedence over cached success without requiring quantity', () => {
  const rejection = quote({
    ok: false,
    reason: 'machine locked',
    quantity: undefined,
  });
  const result = state({ serverResponse: rejection, lastResponse: quote() });
  expect(result.response).toBe(rejection);
  expect(result.quote).toBeNull();
  expect(result.issue).toBe('machine locked');
  expect(result.submitDisabled).toBe(true);
});

test.each([
  [{ ok: false, reason: '' }, 'This trade is unavailable.'],
  [
    { can_afford: false, warrant_ok: false },
    'Treasury cannot cover this trade.',
  ],
  [{ warrant_ok: false }, 'Warrant cannot cover this trade.'],
] as [Partial<TradeQuote>, string][])(
  'quote refusal keeps reason precedence: %j',
  (overrides, issue) => {
    expect(state({ serverResponse: quote(overrides) })).toMatchObject({
      issue,
      submitDisabled: true,
    });
  },
);

test('sequestration takes priority over invalid quantities and refused quotes', () => {
  expect(
    state({
      sequestered: true,
      draft: { ...draft, text: '0' },
      serverResponse: quote({ can_afford: false }),
    }),
  ).toMatchObject({
    canFill: false,
    submitDisabled: true,
    issue: 'Commerce is in sequestration. This trade cannot be placed.',
  });
});

test('export ignores purchase affordability but not stockpile or warrant limits', () => {
  const exportRequest = { ...request, side: 'export' as const };
  expect(
    state({
      request: exportRequest,
      serverResponse: quote({ side: 'export', can_afford: false }),
    }),
  ).toMatchObject({ maxUnits: 30, fillTarget: 20, submitDisabled: false });
  expect(
    state({
      request: exportRequest,
      serverResponse: quote({ side: 'export', stockpile_amount: 0 }),
    }),
  ).toMatchObject({
    maxUnits: 0,
    canFill: false,
    submitDisabled: true,
    issue: 'Nothing in the stockpile to sell.',
  });
});

test('derivation is read-only and preserves successful quote identity', () => {
  const accepted = Object.freeze(quote());
  const input = Object.freeze({
    request: Object.freeze({ ...request }),
    draft: Object.freeze({ ...draft }),
    serverResponse: accepted,
    lastResponse: null,
    sequestered: false,
  });
  const result = deriveTradeQuoteState(input);
  expect(result.response).toBe(accepted);
  expect(result.quote).toBe(accepted);
  expect(result.details).toBe(accepted);
});
