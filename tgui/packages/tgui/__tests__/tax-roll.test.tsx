import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'tax-roll' });
const backend = await import('../backend');
const { TaxRollContent } = await import(
  '../interfaces/TaxSetter/TaxRollContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

type BackendState = NonNullable<Parameters<typeof backend.backendReducer>[0]>;
let store: Store;
let previousStore: Store;
let previousByond: PropertyDescriptor | undefined;
let container: HTMLDivElement;
let root: Root;
let sendMessage: ReturnType<typeof mock>;
const env = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;
const initialData = () => ({
  categoryRates: [
    { category: 'contract_levy', label: 'Contract Levy', rate: 10 },
    { category: 'recovered_spoils', label: 'Recovered Spoils', rate: 15 },
  ],
  pollTaxRates: [
    { category: 'noble', label: 'Nobility', rate: 2 },
    { category: 'peasant', label: 'Peasantry', rate: 0 },
  ],
  pollTaxMin: -50,
  pollTaxMax: 50,
  levyCooldown: false,
  pollCooldown: false,
  pollProjection: { income: 10, subsidy: 0, net: 10, headcount: 5 },
});

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'tax-roll', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: initialData() }));
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
const Connected = () => {
  useSyncExternalStore(store.subscribe, store.getState);
  return <TaxRollContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Record<string, unknown>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const input = (label: string) => {
  const element = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!element) throw new Error(`Missing input: ${label}`);
  return element;
};
const button = (label: string) => {
  const element = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
};
const enter = async (label: string, value: string) => {
  await act(async () => {
    const element = input(label);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (label: string) => {
  await act(async () => button(label).click());
};
const controls = [
  {
    key: 'categoryRates',
    name: 'Crown Levies: Contract Levy',
    action: 'Make It So',
    backendAction: 'set_rates',
    lock: 'levyCooldown',
    invalid: ['', '-1', '1.5', '101'],
    values: [0, 100],
  },
  {
    key: 'pollTaxRates',
    name: 'Poll Tax: Nobility',
    action: 'Set Poll Taxes',
    backendAction: 'set_poll_rates',
    lock: 'pollCooldown',
    invalid: ['', '-51', '1.5', '51'],
    values: [-50, 0, 50],
  },
] as const;

for (const control of controls)
  describe(control.name, () => {
    test.each([...control.invalid])(
      'rejects invalid whole draft %j',
      async (value) => {
        await render();
        await enter(control.name, value);
        expect(input(control.name).getAttribute('aria-invalid')).toBe('true');
        expect(button(control.action).disabled).toBe(true);
        await click(control.action);
        expect(sendMessage).not.toHaveBeenCalled();
      },
    );
    test.each([...control.values])(
      'submits whole boundary %i with exact categories and action',
      async (value) => {
        await render();
        expect(button(control.action).disabled).toBe(true);
        await enter(control.name, String(value));
        expect(button(control.action).disabled).toBe(false);
        await click(control.action);
        const rates = initialData()[control.key].map((row, index) => ({
          category: row.category,
          rate: index === 0 ? value : row.rate,
        }));
        expect(sendMessage.mock.calls).toEqual([
          [`act/${control.backendAction}`, { [control.key]: rates }],
        ]);
      },
    );
    test('untouched rows sync, dirty rows survive until acknowledged, then follow live rates', async () => {
      await render();
      const rows = initialData()[control.key];
      await update({
        [control.key]: rows.map((row) => ({ ...row, rate: 20 })),
      });
      expect(input(control.name).value).toBe('20');
      await enter(control.name, '25.0');
      await update({
        [control.key]: rows.map((row) => ({ ...row, rate: 22 })),
      });
      expect(input(control.name).value).toBe('25.0');
      await click(control.action);
      expect(sendMessage.mock.calls).toEqual([
        [
          `act/${control.backendAction}`,
          {
            [control.key]: [
              { category: rows[0].category, rate: 25 },
              { category: rows[1].category, rate: 22 },
            ],
          },
        ],
      ]);
      await update({
        [control.key]: [
          { ...rows[0], rate: 25 },
          { ...rows[1], rate: 22 },
        ],
      });
      expect(button(control.action).disabled).toBe(true);
      await update({
        [control.key]: rows.map((row) => ({ ...row, rate: 30 })),
      });
      expect(input(control.name).value).toBe('30');
    });
    test('empty draft survives a backend zero update', async () => {
      await render();
      await enter(control.name, '');
      await update({
        [control.key]: initialData()[control.key].map((row) => ({
          ...row,
          rate: 0,
        })),
      });
      expect(input(control.name).value).toBe('');
      expect(button(control.action).disabled).toBe(true);
    });
    test('new categories are included and removed drafts cannot leak into payload', async () => {
      await render();
      await enter(control.name, '25');
      const first = initialData()[control.key][0];
      await update({
        [control.key]: [
          first,
          {
            category: 'new_class',
            label: 'A newly registered category with its full title',
            rate: 12,
          },
        ],
      });
      expect(container.textContent).toContain(
        'A newly registered category with its full title',
      );
      await click(control.action);
      expect(sendMessage.mock.calls).toEqual([
        [
          `act/${control.backendAction}`,
          {
            [control.key]: [
              { category: first.category, rate: 25 },
              { category: 'new_class', rate: 12 },
            ],
          },
        ],
      ]);
    });
    test('lock disables inputs and submission, replaces rejected draft with enacted rates, and leaves the other column editable', async () => {
      await render();
      await enter(control.name, '25');
      await update({
        [control.lock]: true,
        [control.key]: initialData()[control.key].map((row) => ({
          ...row,
          rate: 20,
        })),
      });
      expect(input(control.name).value).toBe('20');
      expect(input(control.name).disabled).toBe(true);
      expect(button(control.action).disabled).toBe(true);
      await click(control.action);
      expect(sendMessage).not.toHaveBeenCalled();
      const other = controls.find((entry) => entry !== control)!;
      expect(input(other.name).disabled).toBe(false);
      await enter(other.name, '26');
      expect(button(other.action).disabled).toBe(false);
      await update({ [control.lock]: false });
      expect(input(control.name).disabled).toBe(false);
      expect(input(control.name).value).toBe('20');
      expect(button(control.action).disabled).toBe(true);
    });
  });

test('poll bounds update live and projection remains explicitly tied to enacted rates', async () => {
  await render();
  await enter('Poll Tax: Nobility', '-25');
  expect(
    container.querySelector('.TaxRoll__projection')?.textContent,
  ).toContain('Current enacted rates · per tick');
  expect(
    container.querySelector('.TaxRoll__projection')?.textContent,
  ).toContain('+10m');
  expect(
    container.querySelector('.TaxRoll__projection')?.textContent,
  ).toContain('Unsaved changes are not included.');
  await update({ pollTaxMin: -20 });
  expect(button('Set Poll Taxes').disabled).toBe(true);
  expect(input('Poll Tax: Nobility').getAttribute('aria-invalid')).toBe('true');
  await update({
    pollProjection: { income: 0, subsidy: 15, net: -15, headcount: 1 },
  });
  expect(
    container.querySelector('.TaxRoll__projection')?.textContent,
  ).toContain('-15m');
  expect(container.querySelector('.TaxRoll__totals')?.textContent).toContain(
    '1 head',
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

test('removed categories lose their stale draft even if later reintroduced', async () => {
  await render();
  await enter('Crown Levies: Contract Levy', '30');
  await update({ categoryRates: [] });
  expect(button('Make It So').disabled).toBe(true);
  await update({ categoryRates: initialData().categoryRates });
  expect(input('Crown Levies: Contract Levy').value).toBe('10');
  expect(button('Make It So').disabled).toBe(true);
});

test('Concordat floor blocks changed rates below five while permitting an untouched enacted zero', async () => {
  await update({
    levySubmissionMin: 5,
    categoryRates: [
      { category: 'contract_levy', label: 'Contract Levy', rate: 10 },
      { category: 'recovered_spoils', label: 'Recovered Spoils', rate: 0 },
    ],
  });
  await render();
  expect(container.textContent).toContain(
    'The Concordat forbids new levies below 5%.',
  );
  await enter('Crown Levies: Contract Levy', '4');
  expect(button('Make It So').disabled).toBe(true);
  await enter('Crown Levies: Contract Levy', '5');
  expect(button('Make It So').disabled).toBe(false);
  expect(
    input('Crown Levies: Recovered Spoils').getAttribute('aria-invalid'),
  ).toBe('false');
  await click('Make It So');
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/set_rates',
      {
        categoryRates: [
          { category: 'contract_levy', rate: 5 },
          { category: 'recovered_spoils', rate: 0 },
        ],
      },
    ],
  ]);
  await enter('Crown Levies: Recovered Spoils', '1');
  expect(button('Make It So').disabled).toBe(true);
  await update({ levySubmissionMin: 0 });
  expect(button('Make It So').disabled).toBe(false);
});
