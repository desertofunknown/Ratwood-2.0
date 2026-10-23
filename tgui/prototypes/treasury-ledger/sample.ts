import { sampleEntries } from './fixtures';
import {
  type Cancel,
  copyPage,
  type DeliverPage,
  type LedgerAction,
  type LedgerEntry,
  type LedgerPage,
  type Schedule,
} from './model';
import { assertDisconnected } from './network-guard';

export const PAGE_SIZE = 50;

/**
 * Sample-only JS literal case-insensitive matching. trim()/toLowerCase() are
 * deliberately not claimed to reproduce DM findtext/trim Unicode semantics.
 * Input records are synthetic Crown records in oldest-first storage order.
 */
export function buildSamplePage(
  entries: readonly LedgerEntry[],
  requestedPage = 1,
  filter = '',
): LedgerPage {
  const query = filter.trim().toLowerCase();
  const page = Math.max(1, requestedPage || 1);
  // Filter the full set before taking a page; never filter only visible rows.
  const matches = [...entries].reverse().filter((entry) => {
    return (
      !query ||
      [entry.from, entry.to, entry.reason].some((text) =>
        text.toLowerCase().includes(query),
      )
    );
  });
  const start = (page - 1) * PAGE_SIZE;
  const visible = matches.slice(start, start + PAGE_SIZE);
  return {
    entries: visible.map((entry) => ({ ...entry })),
    page,
    page_size: PAGE_SIZE,
    shown: visible.length,
    has_more: matches.length > start + PAGE_SIZE,
    filtered: Boolean(query),
  };
}

export type SampleOptions = {
  entries?: readonly LedgerEntry[];
  schedule?: Schedule;
  cancel?: Cancel;
  deliveryDelay?: number;
};

/** In-memory sample source only. This has no production transport adapter. */
export function createSample(
  options: SampleOptions = {},
  validateBoundary: () => void = assertDisconnected,
) {
  validateBoundary();
  let entries = (options.entries ?? sampleEntries).map((entry) => ({
    ...entry,
  }));
  let open = false;
  let generation = 0;
  let page = 1;
  let filter = '';
  const subscribers = new Set<DeliverPage>();
  const timers = new Set<unknown>();
  const schedule = options.schedule ?? ((fn, delay) => setTimeout(fn, delay));
  const cancel =
    options.cancel ??
    ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

  const cancelDeliveries = () => {
    for (const timer of timers) cancel(timer);
    timers.clear();
  };
  const deliver = () => {
    const session = generation;
    const deliveredPage = buildSamplePage(entries, page, filter);
    const recipients = [...subscribers];
    const timer = schedule(() => {
      timers.delete(timer);
      validateBoundary();
      if (!open || session !== generation) return;
      // Capture the local delivery, not a request ID or a latest-request fence.
      for (const recipient of recipients) {
        validateBoundary();
        if (!open || session !== generation) return;
        if (subscribers.has(recipient)) recipient(copyPage(deliveredPage));
      }
    }, options.deliveryDelay ?? 80);
    timers.add(timer);
  };

  const action: LedgerAction = (...command) => {
    validateBoundary();
    switch (command[0]) {
      case 'ledger_open':
        ++generation;
        cancelDeliveries();
        open = true;
        page = 1;
        filter = '';
        deliver();
        break;
      case 'ledger_close':
        ++generation;
        open = false;
        cancelDeliveries();
        break;
      case 'ledger_filter':
        if (!open) return;
        filter = command[1].filter.trim();
        page = 1;
        deliver();
        break;
      case 'ledger_page':
        if (!open) return;
        page = Math.max(1, command[1].page || 1);
        deliver();
        break;
      case 'ledger_refresh':
        if (open) deliver();
        break;
    }
  };

  return {
    action,
    subscribe(recipient: DeliverPage) {
      validateBoundary();
      subscribers.add(recipient);
      return () => {
        subscribers.delete(recipient);
      };
    },
    replaceEntries(next: readonly LedgerEntry[]) {
      validateBoundary();
      entries = next.map((entry) => ({ ...entry }));
    },
    dispose() {
      validateBoundary();
      action('ledger_close');
      subscribers.clear();
    },
  };
}

export type Sample = ReturnType<typeof createSample>;
