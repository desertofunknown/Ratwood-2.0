import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createStore, type Store } from 'common/redux';
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type {
  CalendarEvent,
  CalendarData,
} from '../interfaces/Calendar/shared';

const initialByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
Reflect.set(globalThis, 'Byond', { windowId: 'calendar' });
const backend = await import('../backend');
const { CalendarContent } = await import(
  '../interfaces/Calendar/CalendarContent'
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

const festival = (
  id: string,
  day: number,
  duration_days = 1,
): CalendarEvent => ({
  id,
  day,
  duration_days,
  month: 2,
  calendar_system: 'azurian',
  title: id,
  desc: `First paragraph for ${id}.\n\nSecond paragraph.`,
  color_tag: '#385634',
});
const initialData = (): CalendarData => ({
  today_day: 8,
  today_month: 2,
  today_year: 1514,
  today_week: 2,
  view_month: 2,
  view_year: 1514,
  weekday_names: [
    "Moon's",
    "Tiw's",
    "Wedding's",
    "Thule's",
    "Freyja's",
    "Saturn's",
    "Sun's",
  ],
  days_in_month: 28,
  days_in_week: 7,
  months: [
    { number: 1, name: 'Psyrise', phase: 'Early', season: 'Spring' },
    { number: 2, name: 'Eora', phase: 'Mid', season: 'Spring' },
    { number: 3, name: 'Dendor', phase: 'Late', season: 'Spring' },
  ],
  events: [
    festival('Earlier vigil', 7),
    festival('Long festival', 7, 4),
    festival('Wedding week', 8, 7),
  ],
  wrap_count: 0,
});
beforeEach(() => {
  previousActEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  env.IS_REACT_ACT_ENVIRONMENT = true;
  previousByond = Object.getOwnPropertyDescriptor(globalThis, 'Byond');
  sendMessage = mock();
  Reflect.set(globalThis, 'Byond', { windowId: 'calendar', sendMessage });
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
  return <CalendarContent />;
};
const render = async () => {
  await act(async () => root.render(<Connected />));
};
const update = async (data: Partial<CalendarData>) => {
  await act(async () => store.dispatch(backend.backendUpdate({ data })));
};
const button = (label: string) => {
  const result = Array.from(container.querySelectorAll('button')).find(
    (entry) =>
      (entry.getAttribute('aria-label') || entry.textContent) === label,
  );
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
};
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

const dayButton = (day: number) =>
  container.querySelector<HTMLButtonElement>(`[data-calendar-day="${day}"]`)!;
const key = async (
  day: number,
  key: string,
  modifiers: KeyboardEventInit = {},
) => {
  let event: KeyboardEvent;
  await act(async () => {
    dayButton(day).focus();
    event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    dayButton(day).dispatchEvent(event);
  });
  return event!;
};

test('today is the single tab stop and selected detail, with full festival text', async () => {
  await render();
  expect(container.querySelectorAll('[data-calendar-day]').length).toBe(28);
  expect(
    container.querySelectorAll('[data-calendar-day][tabindex="0"]').length,
  ).toBe(1);
  expect(dayButton(8).tabIndex).toBe(0);
  expect(dayButton(8).getAttribute('aria-current')).toBe('date');
  expect(dayButton(8).getAttribute('aria-pressed')).toBe('true');
  const detail = container.querySelector('.Calendar__detail')!;
  expect(detail.textContent).toContain('Eora 8, 1514 AP');
  expect(detail.textContent).toContain('Long festival');
  expect(detail.textContent).toContain('Second paragraph.');
  expect(detail.textContent).toContain('Eora 8 – Eora 14');
  expect(container.querySelectorAll('.Calendar__week--current').length).toBe(1);
});

test('arrow and week-edge navigation roves without changing selected details or sending actions', async () => {
  await render();
  expect((await key(8, 'ArrowRight')).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(dayButton(9));
  expect(dayButton(9).tabIndex).toBe(0);
  expect(dayButton(8).tabIndex).toBe(-1);
  await key(9, 'ArrowDown');
  expect(document.activeElement).toBe(dayButton(16));
  await key(16, 'Home');
  expect(document.activeElement).toBe(dayButton(15));
  await key(15, 'End');
  expect(document.activeElement).toBe(dayButton(21));
  await key(1, 'ArrowUp');
  expect(document.activeElement).toBe(dayButton(1));
  await key(28, 'ArrowRight');
  expect(document.activeElement).toBe(dayButton(28));
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'Eora 8,',
  );
  expect(sendMessage).not.toHaveBeenCalled();
});

test('modified arrows and Tab remain available to browser, day activation selects all its details', async () => {
  await render();
  expect((await key(8, 'ArrowRight', { ctrlKey: true })).defaultPrevented).toBe(
    false,
  );
  expect((await key(8, 'Tab')).defaultPrevented).toBe(false);
  await click(dayButton(7));
  expect(dayButton(7).getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'Earlier vigil',
  );
  await click(dayButton(1));
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'No events on this date.',
  );
});

test('month navigation, jump and today use exact actions; refreshed month discards old selection', async () => {
  await render();
  await click(dayButton(14));
  await click(button('Next month'));
  await update({ view_month: 3, events: [] });
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'Select a day',
  );
  expect(dayButton(1).tabIndex).toBe(0);
  await click(button('Previous month'));
  await click(button('Return to Today'));
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(sendMessage.mock.calls).toEqual([
    ['act/next_month', {}],
    ['act/prev_month', {}],
    ['act/today', {}],
    ['act/jump_month', { month: 1 }],
  ]);
  await update({ view_month: 1, wrap_count: 12 });
  expect(container.textContent).toContain(
    'Time has folded back upon itself once more.',
  );
  await update({ view_month: 2, wrap_count: 0, events: initialData().events });
  expect(dayButton(8).getAttribute('aria-pressed')).toBe('true');
});

test('incoming server month or date changes use current facts without stale selection', async () => {
  await render();
  await click(dayButton(10));
  await update({ view_month: 3, events: [] });
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'Select a day',
  );
  expect(container.querySelector('[aria-current="date"]')).toBeNull();
  await update({ today_month: 3, today_day: 2, today_week: 1 });
  expect(dayButton(2).getAttribute('aria-current')).toBe('date');
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    'Dendor 2',
  );
});

test('overlapping festival ribbons keep fixed lanes after earlier festivals end', async () => {
  const events = [
    festival('A', 1, 1),
    festival('B', 1, 3),
    festival('C', 2, 4),
  ];
  await update({ events });
  await render();
  const ribbons = (day: number) =>
    Array.from(dayButton(day).querySelector('.Calendar__ribbons')!.children);
  // B sorts first (longer duration) and owns lane0; A lane1 ends before C uses lane1.
  expect(ribbons(1)[0].getAttribute('title')).toBe('B');
  expect(ribbons(2)[0].getAttribute('title')).toBe('B');
  expect(ribbons(2)[1].getAttribute('title')).toBe('C');
  expect(ribbons(4)[0].className).toContain('ribbonSpace');
  expect(ribbons(4)[1].getAttribute('title')).toBe('C');
  expect(ribbons(4)[1].textContent).toBe('\u00a0');
  expect(events.map((event) => event.id)).toEqual(['A', 'B', 'C']);
});

test('overflow festivals stay in accessible names and full day detail', async () => {
  const events = ['One', 'Two', 'Three', 'Four'].map((id) =>
    festival(id, 2, 3),
  );
  await update({ events });
  await render();
  await click(dayButton(3));
  expect(dayButton(3).querySelectorAll('.Calendar__ribbon').length).toBe(3);
  expect(dayButton(3).textContent).toContain('+1 more');
  for (const event of events) {
    expect(dayButton(3).getAttribute('aria-label')).toContain(event.title);
    expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
      event.title,
    );
  }
});

test('short final weeks never expose non-existent dates and names remain plain text', async () => {
  await update({
    days_in_month: 27,
    events: [{ ...festival('<b>Feast</b>', 1), desc: '<img src=x> & customs' }],
  });
  await render();
  expect(container.querySelectorAll('[data-calendar-day]').length).toBe(27);
  expect(dayButton(28)).toBeNull();
  await key(27, 'End');
  expect(document.activeElement).toBe(dayButton(27));
  await click(dayButton(1));
  expect(container.querySelector('.Calendar__detail')!.textContent).toContain(
    '<img src=x> & customs',
  );
  expect(container.querySelector('img')).toBeNull();
});
