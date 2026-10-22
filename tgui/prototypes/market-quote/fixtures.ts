/** Disconnected authored samples, not prices calculated from the game economy.
 * Production contract: StewardTrade/types.ts, MarketView.tsx and TradeModal.tsx.
 */
import type { TradeModalRequest } from '../../packages/tgui/interfaces/StewardTrade/tradeQuote';
import type {
  Data,
  MarketRow,
  TradeQuote,
} from '../../packages/tgui/interfaces/StewardTrade/types';

export type MarketData = Pick<
  Data,
  | 'good_catalog'
  | 'region_catalog'
  | 'market_rows'
  | 'treasury'
  | 'day'
  | 'is_alderman_acting'
  | 'alderman_warrant'
  | 'sequestration'
>;
export type MarketSample = {
  id: string;
  label: string;
  description: string;
  data: MarketData;
  quotes: TradeQuote[];
};
export type PreviewDeliveryKind = 'current' | 'stale' | 'rejected';

const goods: MarketData['good_catalog'] = {
  wheat: { name: 'Wheat', category: 'grain', importable: true },
  iron: { name: 'Iron', category: 'basic_mineral', importable: true },
  ruby: { name: 'Ruby', category: 'gem_rare', importable: false },
};
const regions: MarketData['region_catalog'] = {
  north: {
    name: 'Northern March',
    description: 'Authored sample grain route.',
  },
  east: {
    name: 'Eastern Coast',
    description: 'Authored sample blockaded alternative.',
  },
  south: {
    name: 'Southern Reach',
    description: 'Authored sample best export destination.',
  },
};
const row = (
  good_id: string,
  overrides: Partial<MarketRow> = {},
): MarketRow => ({
  good_id,
  stock: 30,
  stock_limit: 100,
  event_tag: '',
  import_regions: [
    {
      region_id: 'north',
      unit_price: 10,
      capacity_today: 20,
      capacity_total: 40,
      batch_capacity: 20,
      is_blockaded: false,
    },
    {
      region_id: 'east',
      unit_price: 24,
      capacity_today: 10,
      capacity_total: 30,
      batch_capacity: 10,
      is_blockaded: true,
    },
  ],
  export_regions: [
    {
      region_id: 'south',
      unit_price: 8,
      capacity_today: 20,
      capacity_total: 40,
      batch_capacity: 20,
      is_blockaded: false,
    },
    {
      region_id: 'north',
      unit_price: 6,
      capacity_today: 0,
      capacity_total: 20,
      batch_capacity: 0,
      is_blockaded: false,
    },
  ],
  buy_price: 8,
  sell_price: 10,
  market_buy_price: 8,
  market_sell_price: 10,
  automatic_price: true,
  automatic_limit: true,
  accepting: true,
  withdraw_disabled: false,
  autoexport_disabled: false,
  margin_per_unit: 2,
  arbitrage_potential: 60,
  ...overrides,
});
const data: MarketData = {
  good_catalog: goods,
  region_catalog: regions,
  market_rows: [
    row('wheat', { event_tag: 'SHORTAGE' }),
    row('iron'),
    row('ruby', { stock: 0, import_regions: [], export_regions: [] }),
  ],
  treasury: 1000,
  day: 7,
  is_alderman_acting: false,
  alderman_warrant: null,
  sequestration: {
    active: false,
    in_arrears: false,
    debt: 0,
    state_label: 'Open commerce',
  },
};
const quote = (overrides: Partial<TradeQuote>): TradeQuote => ({
  request_id: 'fixture',
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
// Every economic value below is a literal fixture. No quote is computed locally.
const wheatQuotes = [
  quote({}),
  quote({
    quantity: 10,
    base_subtotal: 100,
    total: 100,
    balance_after: 900,
    stockpile_after: 40,
  }),
  quote({
    quantity: 20,
    base_subtotal: 200,
    total: 200,
    balance_after: 800,
    stockpile_after: 50,
  }),
  quote({
    quantity: 30,
    base_subtotal: 300,
    escalation_subtotal: 50,
    total: 350,
    balance_after: 650,
    stockpile_after: 60,
  }),
  quote({
    region_id: 'east',
    region_name: 'Eastern Coast',
    is_blockaded: true,
    batch_capacity: 10,
    capacity_today: 10,
    capacity_total: 30,
    base_unit_price: 12,
    base_subtotal: 12,
    total: 24,
    balance_after: 976,
  }),
  quote({
    region_id: 'east',
    region_name: 'Eastern Coast',
    is_blockaded: true,
    quantity: 10,
    batch_capacity: 10,
    capacity_today: 10,
    capacity_total: 30,
    base_unit_price: 12,
    base_subtotal: 120,
    total: 240,
    balance_after: 760,
    stockpile_after: 40,
  }),
  quote({
    side: 'export',
    region_id: 'south',
    region_name: 'Southern Reach',
    base_unit_price: 8,
    base_subtotal: 8,
    total: 8,
    balance_after: 1008,
    stockpile_after: 29,
  }),
  quote({
    side: 'export',
    region_id: 'south',
    region_name: 'Southern Reach',
    quantity: 10,
    base_unit_price: 8,
    base_subtotal: 80,
    total: 80,
    balance_after: 1080,
    stockpile_after: 20,
  }),
  quote({
    side: 'export',
    region_id: 'south',
    region_name: 'Southern Reach',
    quantity: 20,
    base_unit_price: 8,
    base_subtotal: 160,
    total: 160,
    balance_after: 1160,
    stockpile_after: 10,
  }),
  quote({
    side: 'export',
    region_id: 'north',
    batch_capacity: 0,
    capacity_today: 0,
    capacity_total: 20,
    base_unit_price: 6,
    base_subtotal: 6,
    escalation_subtotal: 1,
    total: 5,
    balance_after: 1005,
    stockpile_after: 29,
  }),
];
const quotes = [
  ...wheatQuotes,
  ...wheatQuotes.map((entry) => ({
    ...entry,
    good_id: 'iron',
    good_name: 'Iron',
  })),
];
export const MARKET_SAMPLES: MarketSample[] = [
  {
    id: 'best-regions',
    label: 'Best regions',
    description:
      'Best buy and sell first; inspect alternatives, saturation and blockade. Recorded quantities: 1, 10, 20 and selected 30.',
    data,
    quotes,
  },
  {
    id: 'insufficient-purse',
    label: 'Insufficient purse',
    description:
      'A successful quote response can still report insufficient treasury funds.',
    data: { ...data, treasury: 0 },
    quotes: quotes
      .filter((q) => q.quantity === 1)
      .map((q) => ({
        ...q,
        balance: 0,
        balance_after:
          q.side === 'import'
            ? q.region_id === 'east'
              ? -24
              : -10
            : q.region_id === 'south'
              ? 8
              : 5,
        can_afford: false,
      })),
  },
  {
    id: 'insufficient-warrant',
    label: 'Insufficient warrant',
    description:
      'Alderman warrant failure is distinct from a treasury failure.',
    data: {
      ...data,
      is_alderman_acting: true,
      alderman_warrant: {
        trade_cap: 100,
        trade_remaining: 0,
        defense_cap: 0,
        defense_remaining: 0,
      },
    },
    quotes: quotes.map((q) => ({
      ...q,
      is_alderman_acting: true,
      warrant_remaining: 0,
      warrant_ok: false,
    })),
  },
  {
    id: 'sequestration',
    label: 'Sequestration',
    description:
      'Commerce is locked. Release the sample lock to request fresh correlated details.',
    data: {
      ...data,
      sequestration: {
        active: true,
        in_arrears: true,
        debt: 300,
        state_label: 'Sequestered',
      },
    },
    quotes,
  },
  {
    id: 'empty-stockpile',
    label: 'Empty stockpile',
    description:
      'Export quotes report no stock available, not merely no regional appetite.',
    data: {
      ...data,
      market_rows: data.market_rows.map((r) => ({ ...r, stock: 0 })),
    },
    quotes: quotes.map((q) => ({
      ...q,
      stockpile_amount: 0,
      stockpile_after: q.side === 'export' ? 0 : q.quantity,
    })),
  },
  {
    id: 'empty-market',
    label: 'Empty market',
    description: 'No accepted goods; no synthetic routes or quote requests.',
    data: { ...data, market_rows: [] },
    quotes: [],
  },
];

export function getPreviewResponse(
  sample: MarketSample,
  request: TradeModalRequest,
  draft: { text: string; id: string },
  kind: PreviewDeliveryKind = 'current',
): TradeQuote {
  const recorded = sample.quotes.find(
    (q) =>
      q.side === request.side &&
      q.region_id === request.regionId &&
      q.good_id === request.goodId &&
      q.quantity === Number(draft.text),
  );
  const response = recorded
    ? { ...recorded }
    : quote({
        ok: false,
        reason:
          'No recorded quote for this sample quantity. Try 1, 10 or 20; no price was calculated.',
        side: request.side,
        region_id: request.regionId,
        good_id: request.goodId,
        quantity: 0,
      });
  if (kind === 'rejected') {
    response.ok = false;
    response.reason =
      'Sample server rejected this route. No shipment was placed.';
    response.quantity = 0; // A rejection matches without a quantity, per production.
  }
  response.request_id = kind === 'stale' ? `stale:${draft.id}` : draft.id;
  return response;
}
