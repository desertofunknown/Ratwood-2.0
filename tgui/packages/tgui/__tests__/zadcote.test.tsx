import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  MailEntry,
  ZadcoteData,
  ZadcoteSlot,
} from '../interfaces/Zadcote/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'zadcote' });
const backend = await import('../backend');
const { ZadcoteContent } = await import('../interfaces/Zadcote/ZadcoteContent');
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const slotData = (slot = 1): ZadcoteSlot => ({
  slot,
  name: `Northern dispatch ${slot}`,
  label: `Northern dispatch ${slot}`,
  bond_ref: `cage-${slot}`,
  severed: false,
  bonded: true,
  in_flight: false,
  cage_occupied: false,
  cage_has_payload: false,
  allow_summons: true,
});
const deskData = (): ZadcoteData => ({
  faction: 'merchant',
  can_operate: true,
  motto: "THE MERCHANT'S ZADCOTE",
  reserve: 10,
  reserve_start: 20,
  flights: 0,
  flight_cap: 3,
  bomb_stock: 3,
  bomb_stock_cap: 10,
  bomb_cooldown_remaining: 0,
  allows_voyeur: true,
  voyeur_fund: 10,
  voyeur_cost: 5,
  slots: [slotData(1), slotData(2)],
  payload_in_hand: [{ name: 'A small parcel', ref: 'parcel-1', w_class: 2 }],
  mail_log: [],
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
  Reflect.set(globalThis, 'Byond', { windowId: 'zadcote', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: deskData() }));
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
  return <ZadcoteContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<ZadcoteData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const updateSlot = async (changes: Partial<ZadcoteSlot>, slot = 1) => {
  const data: ZadcoteData = store.getState().backend.data;
  await update({
    slots: data.slots.map((entry) =>
      entry.slot === slot ? { ...entry, ...changes } : entry,
    ),
  });
};
const row = (slot = 1) =>
  container.querySelector<HTMLElement>(`article[data-slot="${slot}"]`)!;
const panel = (slot = 1) =>
  row(slot).querySelector<HTMLElement>('.Zadcote__dispatch')!;
const button = (label: string, scope: ParentNode = container) => {
  const found = Array.from(scope.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};
const open = async (slot = 1) =>
  click(button('Send', row(slot).querySelector('.Zadcote__slotActions')!));
const textArea = (slot = 1) => panel(slot).querySelector('textarea')!;
const enter = async (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const choose = async (group: string, value: number, slot = 1) =>
  click(
    button(
      String(value),
      panel(slot).querySelector(`[role="group"][aria-label="${group}"]`)!,
    ),
  );

test('dispatch sends the current native draft, selected parcel and exact bonded destination', async () => {
  await render();
  expect(container.querySelector('h1')?.textContent).toBe(
    "THE MERCHANT'S ZADCOTE",
  );
  await open();
  await enter(textArea(), 'Meet at the northern gate.');
  await click(panel().querySelector('input[type="checkbox"]')!);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/dispatch',
      {
        slot: 1,
        bond_ref: 'cage-1',
        zads: 1,
        bombs: 0,
        message: 'Meet at the northern gate.',
        payload_refs: ['parcel-1'],
        bomb_caw: '',
      },
    ],
  ]);
  expect(panel().hidden).toBe(true);
  await open();
  expect(textArea().value).toBe('Meet at the northern gate.');
  expect(
    panel().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
  ).toBe(true);
});

test.each([
  [{ severed: true }, 'The zadlink is severed.'],
  [{ in_flight: true }, 'A flight is already on this slot.'],
  [{ cage_occupied: true }, 'That zadcage is already occupied.'],
  [{ cage_has_payload: true }, 'Unclaimed parcels still sit in that cage.'],
] as [Partial<ZadcoteSlot>, string][])(
  'live slot restriction %j blocks dispatch without dropping the draft',
  async (restriction, reason) => {
    await render();
    await open();
    await enter(textArea(), 'Keep this dispatch.');
    await updateSlot(restriction);
    expect(button('Send', panel()).disabled).toBe(true);
    expect(panel().textContent).toContain(reason);
    expect(textArea().value).toBe('Keep this dispatch.');
    await click(button('Send', panel()));
    expect(sendMessage).not.toHaveBeenCalled();
    await updateSlot(slotData());
    expect(button('Send', panel()).disabled).toBe(false);
  },
);

test('a disappeared cage clears its destination draft and blocks dispatch until a new bond arrives', async () => {
  await render();
  await open();
  await enter(textArea(), 'Only for the original cage.');
  await click(panel().querySelector('input[type="checkbox"]')!);
  await updateSlot({ bonded: false, bond_ref: '' });
  expect(textArea().value).toBe('');
  expect(button('Send', panel()).disabled).toBe(true);
  expect(panel().textContent).toContain('No cage is bonded to this slot.');
  await click(button('Send', panel()));
  expect(sendMessage).not.toHaveBeenCalled();
  await updateSlot({ bonded: true, bond_ref: 'another-cage' });
  expect(textArea().value).toBe('');
  expect(
    panel().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
  ).toBe(false);
  expect(button('Send', panel()).disabled).toBe(false);
});

test('flight limit, reserve and message length are live constraints', async () => {
  await render();
  await open();
  await choose('Zads', 3);
  await update({ flights: 3 });
  expect(panel().textContent).toContain('Too many flights in the air.');
  await click(button('Send', panel()));
  await update({ flights: 0, reserve: 2 });
  expect(panel().textContent).toContain('Only 2 zads remain in the cote.');
  await click(button('Send', panel()));
  await update({ reserve: 3 });
  await enter(textArea(), 'm'.repeat(501));
  expect(textArea().getAttribute('aria-invalid')).toBe('true');
  expect(panel().textContent).toContain('Message exceeds 500 characters.');
  await click(button('Send', panel()));
  expect(sendMessage).not.toHaveBeenCalled();
  await enter(textArea(), 'm'.repeat(500));
  expect(button('Send', panel()).disabled).toBe(false);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[0][1].message).toHaveLength(500);
  expect(sendMessage.mock.calls[0][1].zads).toBe(3);
});

test('payload refs follow live hand contents and weight changes, including lowering the zad tier', async () => {
  await update({
    payload_in_hand: [
      { ref: 'heavy', name: 'Large travelling chest', w_class: 4 },
    ],
  });
  await render();
  await open();
  const parcel = () =>
    panel().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(parcel().disabled).toBe(true);
  await choose('Zads', 3);
  await click(parcel());
  expect(parcel().checked).toBe(true);
  await choose('Zads', 1);
  expect(parcel().checked).toBe(false);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[0][1].payload_refs).toEqual([]);
  await open();
  await choose('Zads', 3);
  expect(parcel().checked).toBe(true);
  await update({
    payload_in_hand: [
      { ref: 'different', name: 'Replacement parcel', w_class: 2 },
    ],
  });
  expect(parcel().checked).toBe(false);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[1][1].payload_refs).toEqual([]);
  await open();
  await click(parcel());
  await update({
    payload_in_hand: [
      { ref: 'different', name: 'Replacement parcel', w_class: 5 },
    ],
  });
  expect(parcel().disabled).toBe(true);
  expect(panel().textContent).toContain('Too heavy for any flight');
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[2][1].payload_refs).toEqual([]);
});

test('bomb dispatch uses one zad per bomb, sends the latest caw and excludes parcels', async () => {
  await render();
  await open();
  await click(panel().querySelector('input[type="checkbox"]')!);
  await choose('Zads', 3);
  await choose('Bottlebombs', 1);
  expect(
    button('1', panel().querySelector('[aria-label="Zads"]')!).getAttribute(
      'aria-pressed',
    ),
  ).toBe('true');
  expect(
    button('3', panel().querySelector('[aria-label="Zads"]')!).disabled,
  ).toBe(true);
  expect(panel().querySelector('input[type="checkbox"]')).toBeNull();
  const caw = panel().querySelector<HTMLInputElement>('.Zadcote__caw input')!;
  expect(caw.maxLength).toBe(40);
  await enter(caw, 'A warning from the cote.');
  await update({ reserve: 1 });
  expect(button('Send', panel()).disabled).toBe(false);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls).toEqual([
    [
      'act/dispatch',
      {
        slot: 1,
        bond_ref: 'cage-1',
        zads: 1,
        bombs: 1,
        message: '',
        payload_refs: [],
        bomb_caw: 'A warning from the cote.',
      },
    ],
  ]);
});

test('selected bombs block on new cooldown or reduced stock, and can be removed without losing the message', async () => {
  await render();
  await open();
  await enter(textArea(), 'Dispatch held.');
  await choose('Bottlebombs', 3);
  await update({ bomb_cooldown_remaining: 61 });
  expect(panel().textContent).toContain('Bombs ready in 01:01');
  await click(button('Send', panel()));
  expect(sendMessage).not.toHaveBeenCalled();
  await update({ bomb_cooldown_remaining: 0, bomb_stock: 2 });
  expect(panel().textContent).toContain(
    'The zadcote has only 2 bottlebombs stored.',
  );
  await click(button('Send', panel()));
  expect(sendMessage).not.toHaveBeenCalled();
  await update({ bomb_stock: 0 });
  await choose('Bottlebombs', 0);
  expect(panel().querySelector('[aria-label="Bottlebombs"]')).toBeNull();
  expect(textArea().value).toBe('Dispatch held.');
  expect(button('Send', panel()).disabled).toBe(false);
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[0][1].bombs).toBe(0);
});

test('dispatch requests preserve complete drafts if the server rejects or later reports a flight', async () => {
  await render();
  await open();
  await enter(textArea(), 'Keep until the dispatch is settled.');
  await choose('Bottlebombs', 2);
  await enter(
    panel().querySelector<HTMLInputElement>('.Zadcote__caw input')!,
    'Last caw.',
  );
  await click(button('Send', panel()));
  await update({ reserve: 1 });
  await open();
  expect(textArea().value).toBe('Keep until the dispatch is settled.');
  expect(
    panel().querySelector<HTMLInputElement>('.Zadcote__caw input')?.value,
  ).toBe('Last caw.');
  expect(
    button(
      '2',
      panel().querySelector('[aria-label="Bottlebombs"]')!,
    ).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(button('Send', panel()).disabled).toBe(true);
  await update({ reserve: 10 });
  await updateSlot({ in_flight: true });
  expect(textArea().value).toBe('Keep until the dispatch is settled.');
  expect(button('Send', panel()).disabled).toBe(true);
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

test('drafts survive tabs, close and slot reorder while replacement bonds get clean drafts', async () => {
  await render();
  await open();
  await enter(textArea(), 'For cage one only.');
  await click(panel().querySelector('input[type="checkbox"]')!);
  await open(2);
  await enter(textArea(2), 'For cage two only.');
  await click(button('Mail Ledger'));
  expect(
    container.querySelector<HTMLElement>('section[aria-label="Zadlinks"]')
      ?.hidden,
  ).toBe(true);
  await update({ slots: [slotData(2), slotData(1)], reserve: 9 });
  await click(button('Zadlinks'));
  expect(textArea(2).value).toBe('For cage two only.');
  await open();
  expect(textArea().value).toBe('For cage one only.');
  await click(button('Close', panel()));
  await open();
  expect(textArea().value).toBe('For cage one only.');
  await updateSlot({
    bond_ref: 'replacement-cage',
    name: 'New destination',
    label: 'New destination',
  });
  expect(textArea().value).toBe('');
  expect(
    panel().querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
  ).toBe(false);
  expect(panel().textContent).toContain('Dispatch to New destination');
  await enter(textArea(), 'Fresh destination message.');
  await click(button('Send', panel()));
  expect(sendMessage.mock.calls[0][1]).toEqual({
    slot: 1,
    bond_ref: 'replacement-cage',
    zads: 1,
    bombs: 0,
    message: 'Fresh destination message.',
    payload_refs: [],
    bomb_caw: '',
  });
});

test('native rename sends immediate text, preserves unsaved edits and follows acknowledged server names', async () => {
  await render();
  await click(row().querySelector('.Zadcote__rename summary')!);
  const name = row().querySelector<HTMLInputElement>('.Zadcote__rename input')!;
  expect(name.maxLength).toBe(32);
  await enter(name, 'New name');
  await updateSlot({
    name: 'A live server rename',
    label: 'A live server rename',
  });
  expect(name.value).toBe('New name');
  await click(button('Set', row()));
  expect(sendMessage.mock.calls).toEqual([
    ['act/set_slot_name', { slot: 1, name: 'New name' }],
  ]);
  await updateSlot({ name: 'New name', label: 'New name' });
  expect(button('Set', row()).disabled).toBe(true);
  await updateSlot({ name: 'Latest server name', label: 'Latest server name' });
  expect(name.value).toBe('Latest server name');
});

test('scry, withdraw, summons, sever and help preserve exact actions and their live guards', async () => {
  await render();
  await click(button('Handbook'));
  await click(button('Withdraw'));
  await click(button('Scry', row()));
  await click(button('Summons: on', row()));
  await click(button('Sever', row()));
  expect(sendMessage.mock.calls).toEqual([
    ['act/help', {}],
    ['act/withdraw_voyeur', {}],
    ['act/voyeur', { slot: 1 }],
    ['act/toggle_summons', { slot: 1 }],
    ['act/sever', { slot: 1 }],
  ]);
  await updateSlot({ allow_summons: false });
  expect(button('Summons: off', row())).toBeDefined();
  await update({ voyeur_fund: 4 });
  expect(button('Scry', row()).disabled).toBe(true);
  await click(button('Scry', row()));
  await update({ voyeur_fund: 0 });
  expect(button('Withdraw').disabled).toBe(true);
  await click(button('Withdraw'));
  await update({ voyeur_fund: 10 });
  await updateSlot({ bonded: false });
  expect(button('Scry', row()).disabled).toBe(true);
  expect(button('Sever', row()).disabled).toBe(true);
  expect(button('Summons: off', row()).disabled).toBe(true);
  await updateSlot({ bonded: true, severed: true });
  expect(button('Scry', row()).disabled).toBe(true);
  expect(button('Sever', row()).disabled).toBe(true);
  await update({ allows_voyeur: false });
  expect(container.textContent).not.toContain('Scrying fund');
  expect(
    Array.from(row().querySelectorAll('button')).some(
      (element) => element.textContent === 'Scry',
    ),
  ).toBe(false);
  expect(sendMessage).toHaveBeenCalledTimes(5);
});

test.each(['merchant', 'steward', 'regent', 'bathhouse'] as const)(
  '%s permission loss locks mutations but keeps navigation and drafts',
  async (faction) => {
    await update({ faction });
    await render();
    await open();
    await enter(textArea(), 'Saved through authority changes.');
    await update({ can_operate: false });
    expect(container.textContent).toContain(
      "Only the zadcote's faction may operate it.",
    );
    expect(row().querySelector('fieldset')?.disabled).toBe(true);
    for (const label of ['Send', 'Scry', 'Summons: on', 'Sever']) {
      const control =
        label === 'Send' ? button(label, panel()) : button(label, row());
      expect(control.disabled).toBe(true);
      await click(control);
    }
    await click(button('Withdraw'));
    await click(button('Handbook'));
    await click(button('Mail Ledger'));
    expect(button('Mail Ledger').getAttribute('aria-pressed')).toBe('true');
    await click(button('Zadlinks'));
    expect(textArea().value).toBe('Saved through authority changes.');
    expect(sendMessage).not.toHaveBeenCalled();
    await update({ can_operate: true });
    expect(button('Send', panel()).disabled).toBe(false);
    expect(textArea().value).toBe('Saved through authority changes.');
  },
);

test('flight status and reserve data track live countdowns and direction', async () => {
  await render();
  await update({
    reserve: 2,
    flights: 2,
    bomb_stock: 1,
    bomb_cooldown_remaining: 60,
  });
  await updateSlot({
    in_flight: true,
    flight_direction: 'outbound',
    flight_zads: 3,
    flight_arrival_seconds: 61,
  });
  expect(row().textContent).toContain('outbound (3) — 01:01');
  expect(container.querySelector('.Zadcote__reserves')?.textContent).toContain(
    'Reserve2 / 20',
  );
  expect(container.querySelector('.Zadcote__reserves')?.textContent).toContain(
    'Bombs ready in01:00',
  );
  await updateSlot({ flight_direction: 'return', flight_arrival_seconds: 0 });
  expect(row().textContent).toContain('returning (3) — 00:00');
  await updateSlot({ in_flight: false, bonded: false });
  expect(row().textContent).toContain('Awaiting a cage');
  await updateSlot({ severed: true });
  expect(row().textContent).toContain('Severed');
});

test('ledger keeps full metadata and message disclosure attached to its entry after new arrivals', async () => {
  const sent: MailEntry = {
    slot: 1,
    sender: 'The complete name of the northern dispatch office',
    message: 'A full message.\nWith a second line.',
    items: ['A named travelling chest', 'A signed letter'],
    stamp: '12:01',
    kind: 'sent',
    zads_used: 2,
    bombs: 2,
    summoned: true,
  };
  const returned: MailEntry = {
    slot: 2,
    sender: 'The southern courier',
    message: '',
    items: ['Returned cloak'],
    stamp: '12:02',
    kind: 'returned',
    zads_used: 3,
    lost: 1,
  };
  await update({ mail_log: [sent, returned] });
  await render();
  await click(button('Mail Ledger (2)'));
  const sentColumn = container.querySelector('section[aria-label="SENT"]')!;
  expect(sentColumn.textContent).toContain(sent.sender);
  expect(sentColumn.textContent).toContain('Summoned: 2 zads');
  expect(sentColumn.textContent).toContain(
    'Carried: A named travelling chest, A signed letter',
  );
  expect(sentColumn.textContent).toContain('2 bottlebombs attached');
  const disclosure = sentColumn.querySelector('details')!;
  await click(disclosure.querySelector('summary')!);
  expect(disclosure.open).toBe(true);
  expect(disclosure.querySelector('blockquote')?.textContent).toBe(
    `“${sent.message}”`,
  );
  const receivedColumn = container.querySelector(
    'section[aria-label="RECEIVED"]',
  )!;
  expect(receivedColumn.textContent).toContain('Returned: 3 zads');
  expect(receivedColumn.textContent).toContain('Brought: Returned cloak');
  expect(receivedColumn.textContent).toContain(
    '1 of 3 zads lost to exhaustion',
  );
  expect(receivedColumn.querySelector('details')).toBeNull();
  await update({
    mail_log: [
      {
        ...sent,
        sender: 'New arrival',
        message: 'New sealed message.',
        stamp: '12:03',
      },
      sent,
      returned,
    ],
  });
  const disclosures = Array.from(sentColumn.querySelectorAll('details'));
  expect(disclosures.map((details) => details.open)).toEqual([false, true]);
  expect(disclosures[1]).toBe(disclosure);
  expect(button('Mail Ledger (3)')).toBeDefined();
  expect(sendMessage).not.toHaveBeenCalled();
});

test('empty states and actual unmount reset dispatch drafts', async () => {
  await render();
  await open();
  await enter(textArea(), 'Not retained after closing the UI.');
  await act(async () => root.render(null));
  await render();
  await open();
  expect(textArea().value).toBe('');
  await update({ slots: [] });
  expect(container.textContent).toContain(
    'No zadlinks. Strike a zadcage on the cote to bond one.',
  );
  await click(button('Mail Ledger'));
  expect(container.querySelectorAll('.Zadcote__mailColumn p').length).toBe(2);
  expect(sendMessage).not.toHaveBeenCalled();
});

test('numeric false scrying permission hides scrying controls without stray zeroes', async () => {
  await update({ allows_voyeur: 0 as unknown as boolean });
  await render();
  expect(container.querySelector('.Zadcote__fund')).toBeNull();
  const actions = row().querySelector('.Zadcote__slotActions')!;
  expect(
    Array.from(actions.querySelectorAll('button')).some(
      (control) => control.textContent === 'Scry',
    ),
  ).toBe(false);
  for (const element of [
    actions,
    container.querySelector('.Zadcote__reserves')!,
  ]) {
    expect(
      Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && node.textContent === '0',
      ),
    ).toBe(false);
  }
});
