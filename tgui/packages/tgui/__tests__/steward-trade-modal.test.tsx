import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { TradeModalRequest } from '../interfaces/StewardTrade/TradeModal';
import type { Data, TradeQuote } from '../interfaces/StewardTrade/types';

// The backend's drag module reads the native window ID during initialization.
const nativeByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
if (!nativeByond)
  Object.defineProperty(globalThis, 'Byond', {
    value: { windowId: 'test' },
    configurable: true,
  });
const backend = await import('../backend');
const { TradeModal } = await import('../interfaces/StewardTrade/TradeModal');
if (!nativeByond) Reflect.deleteProperty(globalThis, 'Byond');

let container: HTMLDivElement;
let opener: HTMLButtonElement;
let root: Root;
let data: Data;
let request: TradeModalRequest | null;
const dispatch = mock((action: string, params?: Record<string, unknown>) => {});
const onClose = mock(() => {});
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;
let backendSpy: ReturnType<typeof spyOn>;
let timerSpy: ReturnType<typeof spyOn>;
let clearTimerSpy: ReturnType<typeof spyOn>;
const timers = new Map<number, () => void>();
let timerId = 10000;

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  dispatch.mockClear();
  onClose.mockReset();
  timers.clear();
  data = {
    trade_quote: null,
    sequestration: { active: false },
    good_catalog: { wheat: { name: 'Wheat' } },
    region_catalog: { north: { name: 'Northern March' } },
  } as unknown as Data;
  request = { side: 'import', goodId: 'wheat', regionId: 'north' };
  backendSpy = spyOn(backend, 'useBackend').mockImplementation((() => ({
    data,
    act: dispatch,
  })) as unknown as typeof backend.useBackend);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  timerSpy = spyOn(window, 'setTimeout').mockImplementation(((
    callback,
    delay,
    ...args
  ) => {
    if (delay !== 120) return realSetTimeout(callback, delay, ...args);
    const id = ++timerId;
    timers.set(id, callback as () => void);
    return id;
  }) as typeof window.setTimeout);
  clearTimerSpy = spyOn(window, 'clearTimeout').mockImplementation((id) => {
    if (!timers.delete(id)) realClearTimeout(id);
  });
  opener = document.createElement('button');
  opener.textContent = 'Import wheat';
  document.body.append(opener);
  opener.focus();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  opener.remove();
  backendSpy.mockRestore();
  timerSpy.mockRestore();
  clearTimerSpy.mockRestore();
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const render = async () => {
  await act(async () =>
    root.render(<TradeModal request={request} onClose={onClose} />),
  );
};
const flushQuote = async () => {
  await act(async () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((callback) => callback());
  });
};
const sentQuotes = () =>
  dispatch.mock.calls.filter(([action]) => action === 'trade_quote');
const latestRequest = () => {
  const sent = sentQuotes();
  const params = sent[sent.length - 1]?.[1];
  if (!params) throw new Error('No quote requested');
  return params;
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) =>
      (element.getAttribute('aria-label') || element.textContent?.trim()) ===
      label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const input = () => container.querySelector('input')!;
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const enter = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const key = async (key: string, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => document.activeElement!.dispatchEvent(event));
  return event;
};
const quote = (
  params = latestRequest(),
  overrides: Partial<TradeQuote> = {},
): TradeQuote => {
  const quantity = params.quantity as number;
  const isImport = params.side === 'import';
  return {
    request_id: params.request_id as string,
    side: params.side as TradeQuote['side'],
    region_id: params.region_id as string,
    good_id: params.good_id as string,
    good_name: 'Wheat',
    region_name: 'Northern March',
    ok: true,
    reason: '',
    quantity,
    max_units: 50,
    daily_pace: 20,
    batch_capacity: 20,
    capacity_today: 20,
    capacity_total: 40,
    base_unit_price: 10,
    base_subtotal: 10 * quantity,
    escalation_subtotal: 0,
    total: 10 * quantity,
    balance: 1000,
    balance_after: 1000 + (isImport ? -10 : 10) * quantity,
    is_blockaded: false,
    is_alderman_acting: false,
    warrant_remaining: -1,
    warrant_ok: true,
    can_afford: true,
    stockpile_amount: 30,
    stockpile_after: 30 + (isImport ? quantity : -quantity),
    ...overrides,
  };
};
const receive = async (response: TradeQuote) => {
  data = { ...data, trade_quote: response };
  await render();
};
const ready = async (overrides: Partial<TradeQuote> = {}) => {
  await render();
  await flushQuote();
  await receive(quote(latestRequest(), overrides));
};
const total = () =>
  container.querySelector('.StewardTradeModal__total dd')?.textContent;

describe('Steward trade quote correlation', () => {
  test('edits invalidate totals immediately and debounce only the latest quantity', async () => {
    await ready();
    expect(button('Confirm Import').disabled).toBe(false);
    expect(total()).toBe('10m');
    await enter('2');
    expect(button('Confirm Import').disabled).toBe(true);
    expect(total()).toBe('…');
    await click(button('Confirm Import'));
    await enter('3');
    expect(sentQuotes()).toHaveLength(1);
    expect(timers.size).toBe(1);
    await flushQuote();
    expect(sentQuotes()).toHaveLength(2);
    expect(latestRequest().quantity).toBe(3);
    await receive(quote());
    expect(total()).toBe('30m');
    await click(button('Confirm Import'));
    await click(button('Confirm Import'));
    expect(
      dispatch.mock.calls.filter(([action]) => action === 'trade_import'),
    ).toEqual([
      ['trade_import', { region_id: 'north', good_id: 'wheat', quantity: 3 }],
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a quantity cycle rejects the first quote and keeps the latest accepted quote through late responses', async () => {
    await ready();
    const first = quote();
    await enter('2');
    await flushQuote();
    const second = quote();
    await enter('1');
    await receive(first);
    expect(button('Confirm Import').disabled).toBe(true);
    await flushQuote();
    const latest = quote(latestRequest(), { total: 12 });
    expect(
      new Set([first.request_id, second.request_id, latest.request_id]).size,
    ).toBe(3);
    await receive(second);
    expect(button('Confirm Import').disabled).toBe(true);
    await receive(latest);
    expect(total()).toBe('12m');
    await receive(first);
    expect(total()).toBe('12m');
    expect(button('Confirm Import').disabled).toBe(false);
  });

  test.each([
    { side: 'export' },
    { region_id: 'south' },
    { good_id: 'iron' },
    { quantity: 2 },
  ] as Partial<TradeQuote>[])(
    'rejects mismatched response fields: %j',
    async (override) => {
      await render();
      await flushQuote();
      await receive(quote(latestRequest(), override));
      expect(button('Confirm Import').disabled).toBe(true);
      expect(total()).toBe('…');
    },
  );

  test('closing and reopening the same trade cannot reuse its old quote', async () => {
    await ready();
    const old = quote();
    await click(button('Cancel'));
    expect(dispatch.mock.calls.at(-1)).toEqual(['trade_quote_close']);
    request = null;
    await render();
    request = { side: 'import', regionId: 'north', goodId: 'wheat' };
    await render();
    expect(button('Confirm Import').disabled).toBe(true);
    await flushQuote();
    expect(latestRequest().request_id).not.toBe(old.request_id);
    await receive(old);
    expect(button('Confirm Import').disabled).toBe(true);
    await receive(quote());
    expect(button('Confirm Import').disabled).toBe(false);
  });

  test('switching trade identity resets quantity, quote and export autofill', async () => {
    await ready();
    await enter('7');
    request = { side: 'export', regionId: 'north', goodId: 'iron' };
    await render();
    expect(input().value).toBe('1');
    expect(button('Confirm Export').disabled).toBe(true);
    await flushQuote();
    expect(latestRequest()).toMatchObject({
      side: 'export',
      good_id: 'iron',
      quantity: 1,
    });
  });

  test('closing before the debounce cancels the quote request', async () => {
    await render();
    await click(button('Cancel'));
    request = null;
    await render();
    await flushQuote();
    expect(dispatch.mock.calls).toEqual([['trade_quote_close']]);
  });
});

describe('Steward quantities, fill and authority', () => {
  test('blank, zero, negative, fractional and over-limit drafts cannot quote or submit', async () => {
    await ready();
    for (const value of ['', '0', '-1', '1.5', '51', '1e2']) {
      await enter(value);
      expect(button('Confirm Import').disabled).toBe(true);
      expect(input().getAttribute('aria-invalid')).toBe('true');
      await click(button('Confirm Import'));
      await flushQuote();
    }
    expect(sentQuotes()).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    await enter('50');
    await flushQuote();
    await receive(quote());
    expect(button('Confirm Import').disabled).toBe(false);
  });

  test('export autofill waits for a correlated response and then requotes the filled quantity', async () => {
    request = { side: 'export', regionId: 'north', goodId: 'wheat' };
    data.trade_quote = quote({
      ...request,
      region_id: 'north',
      good_id: 'wheat',
      quantity: 1,
      request_id: 'old',
    });
    await render();
    expect(input().value).toBe('1');
    await flushQuote();
    await receive(quote(latestRequest(), { batch_capacity: 40 }));
    expect(input().value).toBe('30');
    expect(button('Confirm Export').disabled).toBe(true);
    expect(total()).toBe('…');
    await flushQuote();
    expect(latestRequest().quantity).toBe(30);
    await receive(quote(latestRequest(), { batch_capacity: 40 }));
    expect(button('Increase quantity by one').disabled).toBe(true);
    await click(button('Confirm Export'));
    expect(dispatch.mock.calls.at(-1)).toEqual([
      'trade_export',
      { region_id: 'north', good_id: 'wheat', quantity: 30 },
    ]);
  });

  test.each([
    ['1.0', 1],
    ['1e1', 10],
  ] as const)(
    'whole numeric notation %s sends the integer quantity',
    async (text, quantity) => {
      await render();
      await enter(text);
      expect(input().getAttribute('aria-invalid')).toBe('false');
      await flushQuote();
      expect(latestRequest().quantity).toBe(quantity);
      await receive(quote());
      expect(button('Confirm Import').disabled).toBe(false);
    },
  );

  test('an explicit export draft is not overwritten by a late autofill', async () => {
    request = { side: 'export', regionId: 'north', goodId: 'wheat' };
    await render();
    await flushQuote();
    const initial = quote();
    await enter('3');
    await receive(initial);
    expect(input().value).toBe('3');
    await flushQuote();
    await receive(quote());
    expect(input().value).toBe('3');
    expect(button('Confirm Export').disabled).toBe(false);
  });

  test('import fill respects purse and warrant; ten-unit steppers stop at the fill target', async () => {
    await ready({
      balance: 95,
      is_alderman_acting: true,
      warrant_remaining: 65,
    });
    await click(button('Increase quantity by ten'));
    expect(input().value).toBe('6');
    expect(button('Fill to 6 units before saturation').disabled).toBe(true);
    await click(button('Increase quantity by ten'));
    expect(input().value).toBe('16');
    await click(button('Decrease quantity by ten'));
    expect(input().value).toBe('6');
    await click(button('Decrease quantity by one'));
    await click(button('Fill to 6 units before saturation'));
    expect(input().value).toBe('6');
    await flushQuote();
    expect(latestRequest().quantity).toBe(6);
  });

  test.each([
    [{ can_afford: false }, 'Treasury cannot cover this trade.'],
    [{ warrant_ok: false }, 'Warrant cannot cover this trade.'],
  ] as [Partial<TradeQuote>, string][])(
    'blocks a refused quote: %j',
    async (override, reason) => {
      await ready(override);
      expect(button('Confirm Import').disabled).toBe(true);
      expect(container.textContent).toContain(reason);
      await click(button('Confirm Import'));
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  test('a correlated rejection without successful quote fields shows its server reason', async () => {
    await render();
    await flushQuote();
    await receive({
      ...latestRequest(),
      ok: false,
      reason: 'machine locked',
      quantity: undefined,
    } as unknown as TradeQuote);
    expect(container.textContent).toContain('machine locked');
    expect(container.textContent).not.toContain('Calculating current quote');
    expect(button('Confirm Import').disabled).toBe(true);
  });

  test('sequestration blocks an already quoted trade immediately and cancels pending quotes', async () => {
    await ready();
    data = { ...data, sequestration: { ...data.sequestration, active: true } };
    await render();
    expect(button('Confirm Import').disabled).toBe(true);
    expect(input().disabled).toBe(true);
    expect(container.textContent).toContain('Commerce is in sequestration.');
    await click(button('Confirm Import'));
    await flushQuote();
    expect(sentQuotes()).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    data = { ...data, sequestration: { ...data.sequestration, active: false } };
    await render();
    await enter('2');
    data = { ...data, sequestration: { ...data.sequestration, active: true } };
    await render();
    await flushQuote();
    expect(sentQuotes()).toHaveLength(1);
  });

  test('an empty export stockpile blocks fill and confirmation', async () => {
    request = { side: 'export', regionId: 'north', goodId: 'wheat' };
    await ready({ stockpile_amount: 0 });
    expect(button('Confirm Export').disabled).toBe(true);
    expect(button('Fill before saturation').disabled).toBe(true);
    expect(container.textContent).toContain(
      'Nothing in the stockpile to sell.',
    );
  });

  test('release from sequestration waits for a new quote and ignores pre-hold responses', async () => {
    await ready();
    const beforeHold = quote();
    data = { ...data, sequestration: { ...data.sequestration, active: true } };
    await render();
    data = { ...data, sequestration: { ...data.sequestration, active: false } };
    await render();
    expect(input().value).toBe('1');
    expect(button('Confirm Import').disabled).toBe(true);
    expect(total()).toBe('…');
    await receive(beforeHold);
    expect(button('Confirm Import').disabled).toBe(true);
    await flushQuote();
    expect(latestRequest().request_id).not.toBe(beforeHold.request_id);
    await receive(beforeHold);
    expect(button('Confirm Import').disabled).toBe(true);
    await receive(quote(latestRequest(), { total: 20 }));
    expect(total()).toBe('20m');
    expect(button('Confirm Import').disabled).toBe(false);
    await receive(beforeHold);
    expect(total()).toBe('20m');
  });

  test('blockade, saturation, purse and warrant details retain their trade meaning', async () => {
    await ready({
      is_blockaded: true,
      escalation_subtotal: 5,
      total: 15,
      balance_after: 985,
      is_alderman_acting: true,
      warrant_remaining: 80,
    });
    for (const text of [
      'Blockaded',
      'Cost is doubled.',
      'Escalation surcharge',
      '+5m',
      "Crown's Purse after",
      '985m',
      'Stockpile after',
      '31 units',
      'Warrant remaining',
      '80m',
    ]) {
      expect(container.textContent).toContain(text);
    }
    expect(total()).toBe('15m');
  });
});

describe('Steward modal keyboard behavior', () => {
  test('labels the dialog, contains focus in both directions and restores the opener after Escape', async () => {
    onClose.mockImplementation(() => {
      request = null;
      root.render(<TradeModal request={request} onClose={onClose} />);
    });
    await render();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      container.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)
        ?.textContent,
    ).toBe('Import Wheat');
    expect(document.activeElement).toBe(input());
    const scrollRegion =
      container.querySelector<HTMLElement>('[role="region"]')!;
    expect(scrollRegion.getAttribute('tabindex')).toBe('0');
    scrollRegion.focus();
    const shiftTab = await key('Tab', true);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Cancel'));
    await key('Tab');
    expect(document.activeElement).toBe(scrollRegion);
    opener.focus();
    expect(document.activeElement).toBe(scrollRegion);
    const escape = await key('Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(dispatch.mock.calls).toEqual([['trade_quote_close']]);
    await flushQuote();
    expect(sentQuotes()).toHaveLength(0);
  });

  test('ready confirmation becomes the last tab stop and Cancel still restores focus', async () => {
    onClose.mockImplementation(() => {
      request = null;
      root.render(<TradeModal request={request} onClose={onClose} />);
    });
    await ready();
    button('Confirm Import').focus();
    await key('Tab');
    expect(document.activeElement).toBe(
      container.querySelector('[role="region"]'),
    );
    await key('Tab', true);
    expect(document.activeElement).toBe(button('Confirm Import'));
    await click(button('Cancel'));
    expect(document.activeElement).toBe(opener);
  });
});
