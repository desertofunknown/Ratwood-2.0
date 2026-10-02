import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  FormingWave,
  MigrantData,
  Role,
  WaveInfo,
} from '../interfaces/MigrantPanel/types';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'migrant-panel' });
const backend = await import('../backend');
const { MigrantPanelContent } = await import(
  '../interfaces/MigrantPanel/MigrantPanelContent'
);
if (initialByond) Object.defineProperty(globalThis, 'Byond', initialByond);
else Reflect.deleteProperty(globalThis, 'Byond');

const roleData = (overrides: Partial<Role> = {}): Role => ({
  ref: 'role-knight',
  name: 'Knight of the Northern March and its distant borders',
  amount: 1,
  kind: 'required',
  stars: 2,
  queued: 0,
  can_be: 1,
  desc: 'You serve the northern court.\nKeep your oath, your companions, and your sword.',
  ...overrides,
});
const formingData = (overrides: Partial<FormingWave> = {}): FormingWave => ({
  track: 'regular',
  ref: 'wave-regular',
  name: 'The northern travelling company',
  arrival_at: 1600,
  queued: 0,
  min_optional_fills: 1,
  roles: [
    roleData(),
    roleData({
      ref: 'role-companion',
      name: 'The company physician and travelling herbalist',
      kind: 'optional',
      amount: 2,
      can_be: 0,
      stars: 0,
      desc: 'Attend the travellers in sickness and in health.',
    }),
  ],
  ...overrides,
});
const waveData = (overrides: Partial<WaveInfo> = {}): WaveInfo => ({
  ...formingData(),
  weight: 10,
  roll_chance: 12.5,
  triumph_total: 5,
  triumph_threshold: 25,
  my_contribution: 2,
  maxed: 0,
  locked_until: 0,
  ...overrides,
});
const panelData = (): MigrantData => ({
  server_time: 1000,
  wave_number: 3,
  player_triumph: 14,
  active_migrants: 6,
  round_time: 800,
  queued_wave: null,
  queued_role: null,
  forming: [formingData()],
  next_regular_at: 2000,
  next_special_at: 2200,
  waves: [
    waveData(),
    waveData({
      ref: 'wave-special',
      name: 'Visitors from distant shores',
      track: 'special',
    }),
  ],
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
  Reflect.set(globalThis, 'Byond', { windowId: 'migrant-panel', sendMessage });
  previousStore = backend.globalStore;
  store = createStore<{ backend: BackendState }>((state, action) => ({
    backend: backend.backendReducer(state?.backend, action) as BackendState,
  }));
  backend.setGlobalStore(store);
  store.dispatch(backend.backendUpdate({ data: panelData() }));
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
  return <MigrantPanelContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<MigrantData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
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
const track = (label: string) =>
  container.querySelector<HTMLElement>(`section[aria-label="${label} track"]`)!;
const catalog = () =>
  container.querySelector<HTMLElement>('section[aria-label="Pledge catalog"]')!;

test('forming tracks retain complete names, counts, required and optional rules, and native descriptions', async () => {
  await render();
  const regular = track('Regular');
  expect(regular.textContent).toContain(formingData().name);
  expect(regular.textContent).toContain(roleData().name);
  expect(regular.textContent).toContain(
    'Must be filled or the wave will not arrive.',
  );
  expect(regular.textContent).toContain('Required-Optional');
  expect(regular.textContent).toContain(
    'At least 1 of these must join, but specific slots may stay empty.',
  );
  const description = regular.querySelector('details')!;
  expect(description.open).toBe(false);
  expect(description.querySelector('summary')?.textContent).toBe(
    `${roleData().name} x1`,
  );
  await click(description.querySelector('summary')!);
  expect(description.open).toBe(true);
  expect(description.querySelector('p')?.textContent).toBe(roleData().desc);
  expect(button('Queue', regular).type).toBe('button');
  expect(
    regular.querySelector('[aria-label="2 players queued for this role"]')
      ?.textContent,
  ).toBe('★★');
  await update({ forming: [formingData({ min_optional_fills: 0 })] });
  expect(regular.textContent).toContain(
    'Extra companions - empty slots are fine.',
  );
  expect(regular.textContent).not.toContain('Required-Optional');
  expect(description.open).toBe(true);
  expect(sendMessage).not.toHaveBeenCalled();
});

test('queue clicks use exact wave and role refs without optimistic selection; eligibility changes are authoritative', async () => {
  await render();
  const controls = () =>
    Array.from(track('Regular').querySelectorAll('button'));
  expect(controls()[0].disabled).toBe(false);
  expect(controls()[1].disabled).toBe(true);
  await click(controls()[1]);
  expect(sendMessage).not.toHaveBeenCalled();
  await click(controls()[0]);
  expect(sendMessage.mock.calls).toEqual([
    ['act/queue_role', { wave: 'wave-regular', role: 'role-knight' }],
  ]);
  expect(controls()[0].getAttribute('aria-pressed')).toBe('false');
  await update({
    queued_wave: 'wave-regular',
    queued_role: 'role-knight',
    forming: [formingData({ queued: 1, roles: [roleData({ queued: 1 })] })],
  });
  expect(controls()[0].getAttribute('aria-pressed')).toBe('true');
  expect(controls()[0].textContent).toBe('✓ Queued');
  await click(controls()[0]);
  expect(sendMessage.mock.calls[1]).toEqual([
    'act/queue_role',
    { wave: 'wave-regular', role: 'role-knight' },
  ]);
  await update({
    forming: [
      formingData({ queued: 1, roles: [roleData({ queued: 1, can_be: 0 })] }),
    ],
  });
  expect(controls()[0].disabled).toBe(true);
  await click(controls()[0]);
  expect(sendMessage).toHaveBeenCalledTimes(2);
  await click(button('Queued: The northern travelling company (leave)'));
  expect(sendMessage.mock.calls[2]).toEqual(['act/clear_queue', {}]);
});

test('shared role types are claimed only on the queued wave and queueing can move to another track', async () => {
  await update({
    forming: [
      formingData({ queued: 1, roles: [roleData({ queued: 1 })] }),
      formingData({
        track: 'special',
        ref: 'other-wave',
        name: 'Another company',
        roles: [roleData({ queued: 1 })],
      }),
    ],
  });
  await render();
  expect(
    button('✓ Queued', track('Regular')).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(button('Queue', track('Special')).getAttribute('aria-pressed')).toBe(
    'false',
  );
  await click(button('Queue', track('Special')));
  expect(sendMessage.mock.calls).toEqual([
    ['act/queue_role', { wave: 'other-wave', role: 'role-knight' }],
  ]);
});

test('forming-only event queues retain name, role and Leave even when absent from the pledge catalog', async () => {
  await update({
    queued_wave: 'forced-event',
    queued_role: 'role-knight',
    forming: [
      formingData({
        track: 'event',
        ref: 'forced-event',
        name: 'An administrator-forced company',
        queued: 1,
      }),
    ],
  });
  await render();
  expect(track('Event').textContent).toContain(
    'An administrator-forced company',
  );
  expect(
    container.querySelector('.MigrantPanel__queue')?.textContent,
  ).toContain(roleData().name);
  await click(button('Queued: An administrator-forced company (leave)'));
  expect(sendMessage.mock.calls).toEqual([['act/clear_queue', {}]]);
  expect(catalog().textContent).not.toContain(
    'An administrator-forced company',
  );
});

test('queued catalog fallback and missing-wave fallback both preserve Leave until the server clears it', async () => {
  await update({ queued_wave: 'wave-special', queued_role: 'role-knight' });
  await render();
  await click(button('Queued: Visitors from distant shores (leave)'));
  await update({ queued_wave: 'no-longer-visible' });
  await click(button('Queued (leave)'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/clear_queue', {}],
    ['act/clear_queue', {}],
  ]);
  await update({ queued_wave: null, queued_role: null });
  expect(container.querySelector('.MigrantPanel__queue button')).toBeNull();
  expect(container.textContent).toContain(
    'Pick a role on a forming wave to queue',
  );
});

test('timers follow every server snapshot including a lower clock without inferring role eligibility', async () => {
  await render();
  expect(track('Regular').textContent).toContain('Arrives in 1:00');
  expect(track('Special').textContent).toContain('Next in 2:00');
  expect(track('Triumph').textContent).toContain('Pledge to call a wave');
  expect(container.querySelector('[aria-label="Event track"]')).toBeNull();
  await update({ server_time: 2000 });
  expect(track('Regular').textContent).toContain('Arrives in 0:00');
  expect(button('Queue', track('Regular')).disabled).toBe(false);
  expect(track('Special').textContent).toContain('Next in 0:20');
  await update({ server_time: 900 });
  expect(track('Regular').textContent).toContain('Arrives in 1:10');
  expect(track('Special').textContent).toContain('Next in 2:10');
  expect(sendMessage).not.toHaveBeenCalled();
});

test('triumph and event forming tracks have the same queue contracts and disappear only when server removes them', async () => {
  await update({
    forming: [
      formingData({ track: 'triumph', ref: 'triumph-wave' }),
      formingData({ track: 'event', ref: 'event-wave' }),
    ],
  });
  await render();
  await click(button('Queue', track('Triumph')));
  await click(button('Queue', track('Event')));
  expect(sendMessage.mock.calls).toEqual([
    ['act/queue_role', { wave: 'triumph-wave', role: 'role-knight' }],
    ['act/queue_role', { wave: 'event-wave', role: 'role-knight' }],
  ]);
  await update({ forming: [] });
  expect(container.querySelector('[aria-label="Event track"]')).toBeNull();
  expect(track('Regular').textContent).toContain('Next in 1:40');
  expect(track('Triumph').textContent).toContain('Pledge to call a wave');
});

test('pledging retains server lock, ready, chance, contribution and optional floor information with exact action', async () => {
  await update({
    waves: [waveData({ triumph_total: 30, locked_until: 1600 })],
  });
  await render();
  expect(catalog().textContent).toContain('(ready!)');
  expect(catalog().textContent).toContain('locked 1:00');
  expect(catalog().textContent).toContain('30/25 (you: 2) · Min. Optionals: 1');
  const progress = catalog().querySelector('progress')!;
  expect(progress.getAttribute('value')).toBe('30');
  expect(progress.max).toBe(25);
  expect(progress.getAttribute('aria-label')).toContain(formingData().name);
  await click(button('Pledge', catalog()));
  expect(sendMessage.mock.calls).toEqual([
    ['act/buy_wave', { wave: 'wave-regular' }],
  ]);
  await update({ server_time: 1600 });
  expect(catalog().textContent).toContain('12.5%');
  expect(catalog().textContent).not.toContain('locked');
});

test('only server maxed disables a pledge; low funds and a future lock do not invent additional client gates', async () => {
  await update({ player_triumph: 0, waves: [waveData({ maxed: 1 })] });
  await render();
  expect(catalog().textContent).toContain('(maxed)');
  expect(button('Pledge').disabled).toBe(true);
  await click(button('Pledge'));
  expect(sendMessage).not.toHaveBeenCalled();
  await update({ waves: [waveData({ maxed: 0, locked_until: 2000 })] });
  expect(button('Pledge').disabled).toBe(false);
  await click(button('Pledge'));
  expect(sendMessage.mock.calls).toEqual([
    ['act/buy_wave', { wave: 'wave-regular' }],
  ]);
});

test('catalog tabs are native selected buttons and preserve every full role description', async () => {
  const desc =
    'An authored <em>description</em> & a second line.\nNo text is omitted.';
  const shared = roleData({ desc });
  await update({
    waves: [
      waveData({ roles: [shared, { ...shared, kind: 'optional', amount: 3 }] }),
      waveData({
        ref: 'wave-special',
        name: 'A special arrival',
        track: 'special',
      }),
    ],
  });
  await render();
  expect(button('Regular Migrants').getAttribute('aria-pressed')).toBe('true');
  expect(catalog().querySelectorAll('li').length).toBe(2);
  expect(catalog().textContent).toContain('Required');
  expect(catalog().textContent).toContain('Optional');
  const details = catalog().querySelector('details')!;
  await click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  expect(details.querySelector('p')?.textContent).toBe(desc);
  expect(details.querySelector('em')).toBeNull();
  await click(button('Special Arrivals'));
  expect(button('Special Arrivals').getAttribute('aria-pressed')).toBe('true');
  expect(catalog().textContent).toContain('A special arrival');
  expect(catalog().textContent).not.toContain(formingData().name);
  await click(button('Pledge', catalog()));
  expect(sendMessage.mock.calls).toEqual([
    ['act/buy_wave', { wave: 'wave-special' }],
  ]);
  await update({ waves: [] });
  expect(catalog().textContent).toBe('None available.');
});

test('live snapshot refreshes keep role disclosures with stable roles and update status without sending actions', async () => {
  await render();
  const details = track('Regular').querySelector('details')!;
  await click(details.querySelector('summary')!);
  await update({
    wave_number: 4,
    player_triumph: 8,
    active_migrants: 7,
    forming: [formingData({ roles: [roleData({ stars: 8 })] })],
  });
  expect(container.querySelector('.MigrantPanel__status')?.textContent).toBe(
    'Wave 4 · Triumph: 8Queued: 7',
  );
  expect(details.open).toBe(true);
  expect(
    track('Regular').querySelector(
      '[aria-label="8 players queued for this role"]',
    )?.textContent,
  ).toBe('★★★★★');
  expect(sendMessage).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await render();
  expect(track('Regular').querySelector('details')?.open).toBe(false);
});
