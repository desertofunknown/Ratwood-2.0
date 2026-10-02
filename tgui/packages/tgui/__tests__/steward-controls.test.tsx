import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, type ReactNode, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SequesteredOverlay } from '../interfaces/StewardTrade/SequesteredOverlay';
import type { Data } from '../interfaces/StewardTrade/types';

// The real backend imports drag.ts, which reads the window ID at module load.
const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'steward-controls' });
const backend = await import('../backend');
const { AutoImportView } = await import('../interfaces/StewardTrade/AutoImportView');
const { RoyalCustomPanel } = await import('../interfaces/StewardTrade/RoyalCustomPanel');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

let container: HTMLDivElement;
let root: Root;
type BackendReducerState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;

const stewardData = (overrides: Partial<Data> = {}): Data => ({
  order_pool_cap: 5,
  good_catalog: {
    wheat: { name: 'Wheat', importable: true, category: 'grain' },
    iron: { name: 'Iron', importable: true, category: 'basic_mineral' },
  },
  region_catalog: {}, treasury: 1000, day: 1,
  expected_rural_revenue: 0, expected_wage_outlay: 0, blockaded_regions: [],
  banditry_projection: { total: 0, lines: [], debt: 0 },
  active_events: [], active_orders: [], market_rows: [], region_rows: [],
  is_alderman_acting: false, alderman_warrant: null,
  auto_import: {
    today_spent: 0, purse_floor: 100, floor_target: 10, batch_size: 5,
    max_price_mult: 2,
    essentials: [{ good_id: 'wheat', active: true, stock: 2 }],
    others: [{ good_id: 'iron', active: false, stock: 20 }], history: [],
  },
  trade_quote: null, total_arbitrage_potential: 0,
  autoexport_percentage: 0, autoexport_barred: 0, shortage_goods_open: 0,
  petition_categories: [], petition_tax_pct: 0, petitions_per_day: 0,
  petition: {
    pledge_balance: 0, petitions_remaining: 0, is_steward_role: true,
    is_alderman_acting: false, eligibility: {},
  },
  sequestration: { active: false, in_arrears: false, debt: 0, state_label: '' },
  atc_loan: {
    available: false, can_view: false, min: 0, max: 0, closed_day: 0,
    interest_pct: 0, blocker: '', arrears_consumed: false, loans_drawn: 0,
    outstanding: 0,
  },
  royal_custom_unlocked: true, royal_custom_margin: 100,
  royal_custom_threshold: 1000, royal_custom_volume: 1000,
  ...overrides,
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'steward-controls', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendReducerState }>((state, action) => ({
    // The reducer's inferred return widens its literal suspended:false to boolean.
    backend: backend.backendReducer(state?.backend, action) as BackendReducerState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: stewardData() }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  backend.setGlobalStore(previousStore);
  if (previousByond) Object.defineProperty(globalThis, 'Byond', previousByond);
  else Reflect.deleteProperty(globalThis, 'Byond');
  env.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const render = async (node: ReactNode) => { await act(async () => root.render(node)); };
const update = async (data: Partial<Data>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const input = (label: string) => {
  const found = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`Missing input: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const enter = async (element: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// The renderer subscribes above useBackend in production as well.
const ConnectedControl = ({ kind }: { kind: 'floor' | 'margin' }) => {
  useSyncExternalStore(store.subscribe, store.getState);
  const { data } = backend.useBackend<Data>();
  return kind === 'floor' ? <AutoImportView data={data} /> : <RoyalCustomPanel />;
};

const controls = [
  { kind: 'floor', label: 'Standing import purse floor', cap: 99999, action: 'set_auto_import_purse_floor', key: 'amount' },
  { kind: 'margin', label: 'Royal Custom margin', cap: 500, action: 'set_royal_custom_margin', key: 'value' },
] as const;

for (const control of controls) {
  describe(control.label, () => {
    const updateValue = (value: number) => update(control.kind === 'floor'
      ? { auto_import: { ...store.getState().backend.data.auto_import, purse_floor: value } }
      : { royal_custom_margin: value });

    test.each(['', '-1', '1.5', String(control.cap + 1), '100'])(
      'rejects invalid or unchanged draft %j without dispatch', async (value) => {
        await render(<ConnectedControl kind={control.kind} />);
        await enter(input(control.label), value);
        expect(button('Set').disabled).toBe(true);
        expect(input(control.label).getAttribute('aria-invalid')).toBe(value === '100' ? 'false' : 'true');
        await click(button('Set'));
        expect(sendMessage).not.toHaveBeenCalled();
      },
    );

    test.each([0, 150, control.cap])('submits valid whole amount %i with exact payload', async (value) => {
      await render(<ConnectedControl kind={control.kind} />);
      await enter(input(control.label), String(value));
      expect(input(control.label).getAttribute('aria-invalid')).toBe('false');
      expect(button('Set').disabled).toBe(false);
      await click(button('Set'));
      expect(sendMessage.mock.calls).toEqual([[`act/${control.action}`, { [control.key]: value }]]);
    });

    test('untouched drafts follow backend updates', async () => {
      await render(<ConnectedControl kind={control.kind} />);
      await updateValue(120);
      expect(input(control.label).value).toBe('120');
      expect(button('Set').disabled).toBe(true);
      await updateValue(0);
      expect(input(control.label).value).toBe('0');
      expect(button('Set').disabled).toBe(true);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    test.each(['125', '125.0'])('edited draft %s survives external updates until acknowledgement, then follows updates', async (draft) => {
      await render(<ConnectedControl kind={control.kind} />);
      await enter(input(control.label), draft);
      await updateValue(120);
      expect(input(control.label).value).toBe(draft);
      expect(button('Set').disabled).toBe(false);
      await click(button('Set'));
      await updateValue(125);
      expect(Number(input(control.label).value)).toBe(125);
      expect(button('Set').disabled).toBe(true);
      await updateValue(130);
      expect(input(control.label).value).toBe('130');
      expect(button('Set').disabled).toBe(true);
      expect(sendMessage.mock.calls).toEqual([[`act/${control.action}`, { [control.key]: 125 }]]);
    });

    test('an intentionally cleared draft stays blank and invalid even when the backend is zero', async () => {
      await render(<ConnectedControl kind={control.kind} />);
      await enter(input(control.label), '');
      await updateValue(0);
      expect(input(control.label).value).toBe('');
      expect(input(control.label).getAttribute('aria-invalid')).toBe('true');
      expect(button('Set').disabled).toBe(true);
      await updateValue(120);
      expect(input(control.label).value).toBe('');
      expect(input(control.label).getAttribute('aria-invalid')).toBe('true');
      expect(button('Set').disabled).toBe(true);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    test('Alderman authority blocks an existing valid draft and restores it on return', async () => {
      await render(<ConnectedControl kind={control.kind} />);
      await enter(input(control.label), '125');
      await update({ is_alderman_acting: true });
      expect(input(control.label).disabled).toBe(true);
      expect(button('Set').disabled).toBe(true);
      await click(button('Set'));
      expect(sendMessage).not.toHaveBeenCalled();
      await update({ is_alderman_acting: false });
      expect(input(control.label).value).toBe('125');
      expect(input(control.label).disabled).toBe(false);
      expect(button('Set').disabled).toBe(false);
    });
  });
}

test('Alderman cannot strike or toggle standing imports', async () => {
  await update({ is_alderman_acting: true });
  await render(<ConnectedControl kind="floor" />);
  expect(button('Strike All').disabled).toBe(true);
  await click(button('Strike All'));
  const toggles = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  expect(toggles.length).toBe(2);
  for (const toggle of toggles) {
    expect(toggle.disabled).toBe(true);
    await click(toggle);
  }
  expect(sendMessage).not.toHaveBeenCalled();
});

test('locked Royal Custom removes action controls and preserves the draft across unlock', async () => {
  await render(<ConnectedControl kind="margin" />);
  await enter(input('Royal Custom margin'), '125');
  await update({ royal_custom_unlocked: false, royal_custom_volume: 900 });
  expect(container.textContent).toContain('Locked - volume 900m of 1000m');
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('button')).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
  await update({ royal_custom_unlocked: true });
  expect(input('Royal Custom margin').value).toBe('125');
  expect(button('Set').disabled).toBe(false);
});

const StatefulControls = () => {
  const [value, setValue] = useState('');
  const [count, setCount] = useState(0);
  return <>
    <input aria-label="Preserved draft" value={value} onChange={(event) => setValue(event.target.value)} />
    <input type="checkbox" aria-label="Option" />
    <select aria-label="Destination"><option>A</option><option>B</option></select>
    <textarea aria-label="Notes" />
    <button type="button" onClick={() => setCount(count + 1)}>Count {count}</button>
  </>;
};

test('sequestration encloses native controls in a disabled fieldset and keeps child state across toggles', async () => {
  const view = (active: boolean) => <SequesteredOverlay active={active} label="Standing imports"><StatefulControls /></SequesteredOverlay>;
  await render(view(false));
  await enter(input('Preserved draft'), 'Unsent draft');
  await click(button('Count 0'));
  const originalInput = input('Preserved draft');
  expect(container.querySelector('[role="status"]')).toBeNull();
  await render(view(true));
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Standing imports held by the Ferentian Trading Company.');
  const fieldset = container.querySelector('fieldset');
  expect(fieldset?.disabled).toBe(true);
  expect(fieldset?.getAttribute('aria-label')).toBe('Standing imports');
  const controls = container.querySelectorAll('input, button, select, textarea');
  expect(controls.length).toBe(5);
  // HappyDOM does not implement inherited :disabled matching or fieldset focus
  // suppression. Check the native structure here; browser coverage checks Tab.
  for (const control of controls) {
    expect(control.closest('fieldset')).toBe(fieldset);
    expect(control.closest('legend')).toBeNull();
  }
  expect(input('Preserved draft')).toBe(originalInput);
  expect(input('Preserved draft').value).toBe('Unsent draft');
  expect(button('Count 1')).toBeDefined();
  await render(view(false));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('fieldset')?.disabled).toBe(false);
  for (const control of controls) expect(control.matches(':disabled')).toBe(false);
  expect(input('Preserved draft')).toBe(originalInput);
  expect(input('Preserved draft').value).toBe('Unsent draft');
  await click(button('Count 1'));
  expect(button('Count 2')).toBeDefined();
});
