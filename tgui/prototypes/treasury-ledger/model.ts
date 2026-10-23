import type {
  LedgerEntry,
  LedgerPage,
} from '../../packages/tgui/interfaces/StewardTrade/types';

import { assertDisconnected } from './network-guard';

export type { LedgerEntry, LedgerPage };

export type LedgerViewProps = {
  page?: LedgerPage;
  draft: string;
  onDraft: (value: string) => void;
  onClear: () => void;
  onPage: (page: number) => void;
  onRefresh: () => void;
};

export function projectEntry(entry: LedgerEntry): {
  account: string;
  reason: string;
  amount: string;
  tone: 'mint' | 'burn' | 'other';
} {
  const tone =
    entry.kind === 'mint' ? 'mint' : entry.kind === 'burn' ? 'burn' : 'other';
  return {
    account:
      tone === 'mint'
        ? entry.to
        : tone === 'burn'
          ? entry.from
          : `${entry.from} → ${entry.to}`,
    reason: entry.reason,
    amount: `${tone === 'mint' ? '+' : tone === 'burn' ? '−' : ''}${entry.amount}m`,
    tone,
  };
}

// These are the existing action names and payloads, not a new transport protocol.
export type LedgerCommand =
  | ['ledger_open']
  | ['ledger_close']
  | ['ledger_filter', { filter: string }]
  | ['ledger_page', { page: number }]
  | ['ledger_refresh'];
export type LedgerAction = (...command: LedgerCommand) => void;
export type DeliverPage = (page?: LedgerPage) => void;
export type Schedule = (callback: () => void, delay: number) => unknown;
export type Cancel = (timer: unknown) => void;
export type State = {
  open: boolean;
  draft: string;
  page?: LedgerPage;
};
export type Dependencies = {
  action: LedgerAction;
  // Local injection only. No native subscription, host bridge, or message listener.
  subscribe: (deliver: DeliverPage) => () => void;
  schedule?: Schedule;
  cancel?: Cancel;
};

export function copyPage(page: LedgerPage): LedgerPage {
  return { ...page, entries: page.entries.map((entry) => ({ ...entry })) };
}

export function createController(
  deps: Dependencies,
  validateBoundary: () => void = assertDisconnected,
) {
  validateBoundary();
  let state: State = { open: false, draft: '' };
  let generation = 0;
  let touched = false;
  let timer: unknown;
  let unsubscribeDelivery: (() => void) | undefined;
  const subscribers = new Set<() => void>();
  const schedule = deps.schedule ?? ((fn, delay) => setTimeout(fn, delay));
  const cancel =
    deps.cancel ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const publish = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    subscribers.forEach((notify) => notify());
  };
  const cancelDraft = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const action: LedgerAction = (...command) => {
    validateBoundary();
    deps.action(...command);
  };

  function draft(value: string) {
    validateBoundary();
    if (!state.open || (touched && state.draft === value)) return;
    touched = true;
    cancelDraft();
    publish({ draft: value });
    const session = generation;
    timer = schedule(() => {
      validateBoundary();
      if (!state.open || generation !== session) return;
      timer = undefined;
      // Keep the latest input intact. Only the sample/backend trims its filter.
      action('ledger_filter', { filter: state.draft });
    }, 250);
  }

  return {
    // Stable between changes, but every delivery makes a fresh nested copy.
    snapshot: () => state,
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    open() {
      validateBoundary();
      if (state.open) return;
      const session = ++generation;
      touched = false;
      publish({ open: true, draft: '', page: undefined });
      if (!state.open || generation !== session) return;
      const unsubscribe = deps.subscribe((page) => {
        validateBoundary();
        if (!state.open || generation !== session) return;
        // Do not fence by filter/page request: production has no response IDs.
        publish({ page: page === undefined ? undefined : copyPage(page) });
      });
      if (!state.open || generation !== session) {
        unsubscribe();
        return;
      }
      unsubscribeDelivery = unsubscribe;
      action('ledger_open');
    },
    close() {
      validateBoundary();
      if (!state.open) return;
      ++generation;
      cancelDraft();
      unsubscribeDelivery?.();
      unsubscribeDelivery = undefined;
      state = { open: false, draft: '' };
      touched = false;
      action('ledger_close');
      subscribers.forEach((notify) => notify());
    },
    draft,
    clear: () => draft(''),
    page(page: number) {
      validateBoundary();
      if (state.open) action('ledger_page', { page });
    },
    refresh() {
      validateBoundary();
      if (state.open) action('ledger_refresh');
    },
  };
}

export type Controller = ReturnType<typeof createController>;
