import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { ZadcageData } from '../interfaces/Zadcage/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'zadcage' });
const backend = await import('../backend');
const { ZadcageContent } = await import('../interfaces/Zadcage/ZadcageContent');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const cageData = (): ZadcageData => ({
  bonded: true,
  severed: false,
  slot_label: 'The complete name of the northern courier office',
  slot_index: 2,
  cote_name: "The Merchant's Zadcote",
  cote_motto: 'Authored motto',
  allow_summons: true,
  pending_flight: false,
  occupied: true,
  flight_ref: 'flight-1',
  time_remaining: 180,
  warning_tail: false,
  capacity: 2,
  has_bombs: false,
  reply_message: 'Previously saved reply.',
  payload_in_hand: [
    {
      name: 'The signed inventory and northern dispatch documents',
      ref: 'parcel-1',
      w_class: 3,
    },
  ],
  stored_payload: [],
});

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

beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'zadcage', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: cageData() }));
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
  return <ZadcageContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<ZadcageData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const found = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const reply = () => container.querySelector('textarea')!;
const parcel = () =>
  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const enter = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(reply(), value);
    reply().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('Send Reply atomically sends the unsaved synchronous reply, selected parcel and current flight', async () => {
  await render();
  expect(container.querySelector('h1')).toBeNull();
  expect(container.textContent).toContain(
    "The Merchant's Zadcote - Slot 2: The complete name of the northern courier office",
  );
  expect(container.textContent).toContain(
    'The signed inventory and northern dispatch documents',
  );
  await enter('Latest typed reply.\nThe full second line.');
  await click(parcel());
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/send_reply',
      {
        message: 'Latest typed reply.\nThe full second line.',
        payload_ref: 'parcel-1',
        flight_ref: 'flight-1',
      },
    ],
  ]);
  expect(reply().value).toBe('Latest typed reply.\nThe full second line.');
  expect(parcel().checked).toBe(true);
});

test('Set uses current flight identity and current text without clearing a rejected draft', async () => {
  await render();
  expect(button('Set').disabled).toBe(true);
  await click(button('Set'));
  await enter('Save this reply.');
  await click(button('Set'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/set_reply_message',
      { message: 'Save this reply.', flight_ref: 'flight-1' },
    ],
  ]);
  await update({ time_remaining: 179 });
  expect(reply().value).toBe('Save this reply.');
  expect(button('Set').disabled).toBe(false);
});

test('clean replies follow live server text, while unsaved drafts survive remote changes until acknowledged', async () => {
  await render();
  await update({ reply_message: 'A newer saved reply.' });
  expect(reply().value).toBe('A newer saved reply.');
  await enter('My unsaved draft.');
  await update({
    reply_message: 'Someone else saved this.',
    time_remaining: 130,
  });
  expect(reply().value).toBe('My unsaved draft.');
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls[0][1].message).toBe('My unsaved draft.');
  await update({ reply_message: 'My unsaved draft.' });
  expect(button('Set').disabled).toBe(true);
  await update({ reply_message: 'Fresh authoritative reply.' });
  expect(reply().value).toBe('Fresh authoritative reply.');
});

test('a new occupied flight cannot inherit a draft or selected parcel without an empty interlude', async () => {
  await render();
  await enter('For the first flight only.');
  await click(parcel());
  await update({
    flight_ref: 'flight-2',
    reply_message: 'Second flight reply.',
    capacity: 3,
  });
  expect(reply().value).toBe('Second flight reply.');
  expect(parcel().checked).toBe(false);
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/send_reply',
      {
        message: 'Second flight reply.',
        payload_ref: '',
        flight_ref: 'flight-2',
      },
    ],
  ]);
});

test('departure removes reply controls and a later arrival starts from its server reply', async () => {
  await render();
  await enter('Unsent draft.');
  await update({ occupied: false, flight_ref: '' });
  expect(container.querySelector('textarea')).toBeNull();
  expect(
    Array.from(container.querySelectorAll('button')).some(
      (element) => element.textContent === 'Send Reply',
    ),
  ).toBe(false);
  await update({ occupied: true, flight_ref: 'flight-3', reply_message: '' });
  expect(reply().value).toBe('');
  expect(sendMessage).not.toHaveBeenCalled();
});

test('capacity loss clears an overweight selection permanently until explicitly selected again', async () => {
  await update({
    capacity: 3,
    payload_in_hand: [
      { ref: 'bulky', name: 'Large travelling chest', w_class: 4 },
    ],
  });
  await render();
  await click(parcel());
  expect(parcel().checked).toBe(true);
  await update({ capacity: 1 });
  expect(parcel().checked).toBe(false);
  expect(parcel().disabled).toBe(true);
  expect(container.textContent).toContain('bulky - too heavy for 1 zad');
  await update({ capacity: 3 });
  expect(parcel().checked).toBe(false);
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls[0][1].payload_ref).toBe('');
});

test('live hand changes and item weight changes clear stale parcel refs', async () => {
  await render();
  await click(parcel());
  await update({ payload_in_hand: [] });
  expect(container.textContent).toContain(
    'Empty-handed - hold something to offer it as the return parcel.',
  );
  await update({ payload_in_hand: cageData().payload_in_hand });
  expect(parcel().checked).toBe(false);
  await click(parcel());
  await update({
    payload_in_hand: [
      { ref: 'parcel-1', name: 'Filled dispatch container', w_class: 5 },
    ],
  });
  expect(parcel().checked).toBe(false);
  expect(parcel().disabled).toBe(true);
  await update({ payload_in_hand: cageData().payload_in_hand });
  expect(parcel().checked).toBe(false);
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls[0][1].payload_ref).toBe('');
});

test.each([
  [1, 2, false],
  [1, 3, true],
  [2, 3, false],
  [2, 4, true],
  [3, 4, false],
  [3, 5, true],
] as const)(
  'capacity %i applies parcel weight %i guard %j',
  async (capacity, weight, disabled) => {
    await update({
      capacity,
      payload_in_hand: [
        { ref: 'parcel', name: 'Weighted parcel', w_class: weight },
      ],
    });
    await render();
    expect(parcel().disabled).toBe(disabled);
    await click(parcel());
    await click(button('Send Reply'));
    expect(sendMessage.mock.calls[0][1].payload_ref).toBe(
      disabled ? '' : 'parcel',
    );
  },
);

test('reply length and flight identity guard both reply actions, and an empty reply remains sendable', async () => {
  await render();
  expect(reply().maxLength).toBe(500);
  await enter('m'.repeat(501));
  expect(reply().getAttribute('aria-invalid')).toBe('true');
  expect(button('Set').disabled).toBe(true);
  expect(button('Send Reply').disabled).toBe(true);
  await click(button('Send Reply'));
  await enter('m'.repeat(500));
  expect(button('Send Reply').disabled).toBe(false);
  await update({ flight_ref: '' });
  expect(button('Send Reply').disabled).toBe(true);
  await update({ flight_ref: 'new-flight', reply_message: '' });
  await enter('');
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/send_reply',
      { message: '', payload_ref: '', flight_ref: 'new-flight' },
    ],
  ]);
});

test('countdown and auto-depart warning update without losing the draft; severing does not bar an owed return', async () => {
  await render();
  await enter('A final reply.');
  await update({ time_remaining: 61 });
  expect(
    container.querySelector('.Zadcage__occupancy header strong')?.textContent,
  ).toBe('1:01');
  await update({ warning_tail: true, time_remaining: 1, severed: true });
  expect(
    container.querySelector('.Zadcage__occupancy header strong')?.textContent,
  ).toBe('0:01');
  expect(container.textContent).toContain(
    'Auto-depart imminent. Auto-depart will NOT carry your reply or package.',
  );
  expect(container.textContent).toContain('The zadlink has been severed.');
  expect(reply().value).toBe('A final reply.');
  expect(button('Send Reply').disabled).toBe(false);
  await click(button('Send Reply'));
  expect(sendMessage.mock.calls[0][1].message).toBe('A final reply.');
});

test.each([0, -1])(
  'expired occupancy at %i seconds bars Set and Send before the cage clears',
  async (remaining) => {
    await render();
    await enter('Keep the unsent reply.');
    await click(parcel());
    await update({ time_remaining: remaining });
    expect(
      container.querySelector('.Zadcage__occupancy header strong')?.textContent,
    ).toBe('0:00');
    expect(button('Set').disabled).toBe(true);
    expect(button('Send Reply').disabled).toBe(true);
    await click(button('Set'));
    await click(button('Send Reply'));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(reply().value).toBe('Keep the unsent reply.');
    expect(parcel().checked).toBe(true);
  },
);

test.each([1, 2, 3])(
  'summoning sends selected tier %i and waits for authoritative pending state',
  async (zads) => {
    await update({ occupied: false, flight_ref: '' });
    await render();
    await click(button(String(zads)));
    expect(button(String(zads)).getAttribute('aria-pressed')).toBe('true');
    await click(button('Summon'));
    expect(sendMessage.mock.calls).toEqual([['act/request_summon', { zads }]]);
    expect(button('Summon').disabled).toBe(false);
    await update({ pending_flight: true });
    expect(container.textContent).toContain('A flight is already on the way.');
    expect(button('Summon').disabled).toBe(true);
    expect(
      container.querySelector('[role="group"][aria-label="Zads"]'),
    ).toBeNull();
    await click(button('Summon'));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { occupied: true },
  { bonded: false },
  { severed: true },
  { allow_summons: false },
])('summon restrictions %j remove the action', async (restriction) => {
  await update({ occupied: false, ...restriction });
  await render();
  expect(container.querySelector('.Zadcage__summon')).toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
});

test('stored parcels retain full names and can be retrieved independently of bonding or occupancy', async () => {
  const name =
    'The complete name of a large travelling chest containing the northern inventory';
  await update({
    occupied: false,
    bonded: false,
    stored_payload: [{ name }, { name: 'A sealed note' }],
  });
  await render();
  expect(container.textContent).toContain(
    'Unbonded - strike against a zadcote to bond.',
  );
  expect(container.querySelector('.Zadcage__stored li')?.textContent).toBe(
    name,
  );
  await click(button('Retrieve'));
  await click(button('Handbook'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/retrieve', {}],
    ['act/help', {}],
  ]);
  expect(container.textContent).toContain(name);
  await update({ stored_payload: [] });
  expect(container.querySelector('.Zadcage__stored')).toBeNull();
});

test('numeric BYOND false flags do not print stray zeroes in empty or occupied views', async () => {
  const off = 0 as unknown as boolean;
  const on = 1 as unknown as boolean;
  await update({ occupied: off, severed: off, allow_summons: off });
  await render();
  const directZero = (element: Element) =>
    Array.from(element.childNodes).some(
      (node) => node.nodeType === 3 && node.textContent === '0',
    );
  expect(directZero(container.querySelector('main')!)).toBe(false);
  await update({ bonded: off });
  expect(directZero(container.querySelector('main')!)).toBe(false);
  await update({ occupied: on, warning_tail: off });
  expect(directZero(container.querySelector('.Zadcage__occupancy')!)).toBe(
    false,
  );
});
