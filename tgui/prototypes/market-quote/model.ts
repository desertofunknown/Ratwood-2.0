/** Disconnected inspection controller. Source semantics: production MarketView,
 * TradeModal and tradeQuote. This controller owns no transport or shipment action.
 */
import { groupByCategory } from '../../packages/tgui/interfaces/StewardTrade/helpers';
import {
  computeFillTarget,
  deriveTradeQuoteState,
  type TradeModalRequest,
} from '../../packages/tgui/interfaces/StewardTrade/tradeQuote';
import type { TradeQuote } from '../../packages/tgui/interfaces/StewardTrade/types';
import { assertDisconnected } from '../selection-prompt/network-guard';
import {
  getPreviewResponse,
  MARKET_SAMPLES,
  type MarketData,
  type MarketSample,
  type PreviewDeliveryKind,
} from './fixtures';
export type {
  TradeModalRequest,
  TradeQuote,
  MarketData,
  MarketSample,
  PreviewDeliveryKind,
};
export { MARKET_SAMPLES };
export type QuoteState = ReturnType<typeof deriveTradeQuoteState>;
export type MarketSnapshot = {
  sample: MarketSample;
  data: MarketData;
  groups: ReturnType<typeof groupByCategory<MarketData['market_rows'][number]>>;
  activeCategory: string;
  activeGroup:
    | ReturnType<
        typeof groupByCategory<MarketData['market_rows'][number]>
      >[number]
    | undefined;
  expanded: string[];
  request: TradeModalRequest | null;
  draft: { text: string; id: string };
  quoteState: QuoteState | null;
  lastResponse: TradeQuote | null;
  serverResponse: TradeQuote | null;
  deliveryNote: string;
};
let sequence = 0;
const nextId = () => `sample-quote-${++sequence}`;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createMarketController(sampleId = 'best-regions') {
  assertDisconnected();
  let sample = copy(
    MARKET_SAMPLES.find((s) => s.id === sampleId) ?? MARKET_SAMPLES[0],
  );
  let data = sample.data;
  let activeCategory =
    groupByCategory(data.market_rows, data.good_catalog)[0]?.category ?? '';
  let expanded: string[] = [];
  let request: TradeModalRequest | null = null;
  let draft = { text: '1', id: nextId() };
  let lastResponse: TradeQuote | null = null;
  let serverResponse: TradeQuote | null = null;
  let autoFilled = false;
  let deliveryNote = '';
  let disposed = false;
  const listeners = new Set<() => void>();
  const derive = () =>
    request
      ? deriveTradeQuoteState({
          request,
          draft,
          serverResponse,
          lastResponse,
          sequestered: !!data.sequestration.active,
        })
      : null;
  const buildSnapshot = (): MarketSnapshot => {
    const groups = groupByCategory(data.market_rows, data.good_catalog);
    const activeGroup =
      groups.find((g) => g.category === activeCategory) ?? groups[0];
    return {
      sample,
      data,
      groups,
      activeCategory: activeGroup?.category ?? '',
      activeGroup,
      expanded: [...expanded],
      request,
      draft,
      quoteState: derive(),
      lastResponse,
      serverResponse,
      deliveryNote,
    };
  };
  let cached = buildSnapshot();
  const allowed = () => {
    assertDisconnected();
    return !disposed;
  };
  const publish = () => {
    cached = buildSnapshot();
    listeners.forEach((listener) => listener());
  };
  const resetQuote = () => {
    request = null;
    draft = { text: '1', id: nextId() };
    lastResponse = null;
    serverResponse = null;
    autoFilled = false;
    deliveryNote = '';
  };
  const setQuantity = (text: string) => {
    if (!allowed() || !request || data.sequestration.active) return;
    autoFilled = true;
    draft = { text, id: nextId() };
    deliveryNote = '';
    publish();
  };
  const deliver = (response: TradeQuote) => {
    if (!allowed() || !request) return;
    serverResponse = copy(response);
    const state = derive()!;
    // Only an exact correlated response is cached; late responses cannot replace it.
    if (state.response) lastResponse = state.response;
    deliveryNote =
      state.response === serverResponse
        ? 'Recorded sample response delivered. No shipment was placed.'
        : 'Stale or mismatched sample response ignored.';
    // Production export dialogs auto-fill only on their first accepted success.
    if (!state.isImport && state.quote && !autoFilled) {
      autoFilled = true;
      const target = computeFillTarget(state.quote);
      if (target >= 1 && target !== state.quantity) {
        draft = { text: String(target), id: nextId() };
        deliveryNote =
          'Export quantity filled from recorded capacity. Deliver another preview for this new quantity.';
      }
    }
    publish();
  };
  const controller = {
    snapshot: () => cached,
    getSnapshot: () => cached,
    subscribe(listener: () => void) {
      if (!allowed()) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectSample(id: string) {
      if (!allowed()) return;
      const selected = MARKET_SAMPLES.find((s) => s.id === id);
      if (!selected) return;
      sample = copy(selected);
      data = sample.data;
      activeCategory =
        groupByCategory(data.market_rows, data.good_catalog)[0]?.category ?? '';
      expanded = [];
      resetQuote();
      publish();
    },
    selectCategory(category: string) {
      if (
        !allowed() ||
        !groupByCategory(data.market_rows, data.good_catalog).some(
          (g) => g.category === category,
        )
      )
        return;
      activeCategory = category;
      publish();
    },
    // The read-only view combines buy/sell alternatives under one good disclosure.
    toggleExpanded(key: string) {
      if (!allowed()) return;
      expanded = expanded.includes(key)
        ? expanded.filter((entry) => entry !== key)
        : [...expanded, key];
      publish();
    },
    openQuote(selection: TradeModalRequest) {
      if (!allowed()) return;
      const row = data.market_rows.find((r) => r.good_id === selection.goodId);
      const routes =
        selection.side === 'import' ? row?.import_regions : row?.export_regions;
      if (!routes?.some((region) => region.region_id === selection.regionId))
        return;
      resetQuote();
      request = { ...selection };
      publish();
    },
    setQuantity,
    changeQuantity(delta: number) {
      if (!allowed() || !request || data.sequestration.active) return;
      const state = derive()!;
      if (state.maxUnits < 1) return;
      const current = state.wholeQuantity ? state.quantity : 1;
      let next = current + delta;
      if (
        state.canFill &&
        ((delta > 0 && current < state.fillTarget && next > state.fillTarget) ||
          (delta < 0 && current > state.fillTarget && next < state.fillTarget))
      )
        next = state.fillTarget;
      setQuantity(String(Math.max(1, Math.min(state.maxUnits, next))));
    },
    fillQuantity() {
      if (!allowed()) return;
      const state = derive();
      if (state?.canFill && !state.atFill)
        setQuantity(String(state.fillTarget));
    },
    deliver,
    deliverPreview(kind: PreviewDeliveryKind = 'current') {
      if (!allowed() || !request) return;
      const state = derive()!;
      if (!state.validQuantity || data.sequestration.active) return;
      deliver(getPreviewResponse(sample, request, draft, kind));
    },
    closeQuote() {
      if (!allowed()) return;
      resetQuote();
      publish();
    },
    setSequestered(active: boolean) {
      if (!allowed() || !!data.sequestration.active === active) return;
      data = { ...data, sequestration: { ...data.sequestration, active } };
      // Production invalidates on entering sequestration, not on release.
      if (active && request) draft = { ...draft, id: nextId() };
      deliveryNote = '';
      publish();
    },
    dispose() {
      assertDisconnected();
      disposed = true;
      resetQuote();
      cached = buildSnapshot();
      listeners.clear();
    },
  };
  return controller;
}
export type MarketController = ReturnType<typeof createMarketController>;
