import { expect, test } from 'bun:test';
import { attempted, installTripwires } from './tripwires';
import { base, runScenarios, type Call, type Factory } from './scenarios';
import { createReactAlertPrompt } from '../react-mount';
import { createSvelteAlertPrompt } from '../svelte-mount';
installTripwires(false);
const errors: string[] = [];
const original = console.error;
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(' '));
  original(...args);
};
window.addEventListener('error', (e) =>
  errors.push(e.message || String(e.error)),
);
const pause = () => new Promise<void>((done) => setTimeout(done, 12));
const selected = process.env.ALERT_FRAMEWORK;
if (selected !== 'React' && selected !== 'Svelte')
  throw Error('Run tests/run.ts for isolated processes');
const mount =
  selected === 'React' ? createReactAlertPrompt : createSvelteAlertPrompt;
const make: Factory = async (data) => {
  const host = document.createElement('div');
  document.body.append(host);
  const calls: Call[] = [];
  let current = data;
  const session = mount(host, data, (action, params) =>
    calls.push([action, params ?? {}]),
  );
  const settle = async (action?: () => void) => {
    action?.();
    await pause();
  };
  for (let i = 0; i < 40; i++) {
    await pause();
    if (
      host.querySelector('[data-alert-content]') &&
      (!data.autofocus || host.contains(document.activeElement))
    )
      break;
  }
  return {
    host,
    calls,
    settle,
    update: async (patch) =>
      settle(() => {
        current = { ...current, ...patch };
        session.update(current);
      }),
    destroy: async () => {
      session.destroy();
      await pause();
      host.remove();
    },
  };
};
test(`${selected}: matched actual production AlertModal DOM and synthetic events`, async () => {
  const actual = JSON.parse(JSON.stringify(await runScenarios(make)));
  const expected = await Bun.file(process.env.ALERT_ORACLE_PATH!).json();
  if (process.env.ALERT_CANDIDATE_PATH)
    await Bun.write(
      process.env.ALERT_CANDIDATE_PATH,
      JSON.stringify(actual, null, 2),
    );
  expect(Object.keys(expected)).toHaveLength(26);
  expect(
    Object.values(expected).reduce((n: number, v: any) => n + v.length, 0),
  ).toBe(117);
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  for (const name of Object.keys(expected))
    expect(actual[name], `${selected}/${name}`).toEqual(expected[name]);
  expect(attempted()).toEqual([]);
  console.log(
    `${selected} matched ${Object.keys(actual).length} scenarios / ${Object.values(actual).reduce((n: number, v: any) => n + v.length, 0)} observations.`,
  );
}, 30000);
test(`${selected}: local close is distinct from cancellation and stale actions are inert`, async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const calls: Call[] = [];
  let closes = 0;
  const session = mount(
    host,
    base(),
    (a, p) => calls.push([a, p ?? {}]),
    () => closes++,
  );
  await pause();
  await pause();
  const stale = host.querySelector<HTMLElement>('[data-alert-choice]')!;
  host.querySelector<HTMLElement>('[data-alert-close]')!.click();
  await pause();
  expect(host.textContent).toBe('');
  expect(closes).toBe(1);
  expect(calls).toEqual([]);
  const closed = session.controller.getSnapshot();
  stale.click();
  session.controller.choose(0);
  session.controller.focus(1);
  session.controller.deliver(base());
  session.controller.keyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
  session.controller.close();
  expect(session.controller.getSnapshot()).toBe(closed);
  expect(calls).toEqual([]);
  expect(closes).toBe(1);
  session.destroy();
  await pause();
  host.remove();
});
test(`${selected}: unmount cancels autofocus rather than stealing later focus`, async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const sentinel = document.createElement('button');
  document.body.append(sentinel);
  const session = mount(host, base(), () => {});
  session.destroy();
  sentinel.focus();
  await pause();
  expect(document.activeElement).toBe(sentinel);
  host.remove();
  sentinel.remove();
});
test(`${selected}: no swallowed runtime errors or forbidden effects`, () => {
  expect(errors).toEqual([]);
  expect(attempted()).toEqual([]);
});

for (const name of ['Byond', 'hubStorage'])
  for (const scopeName of ['global', 'window'])
    test(`${selected}: rejects ${scopeName}.${name} before mounting or reading`, () => {
      const scope = scopeName === 'global' ? globalThis : window;
      const old = Object.getOwnPropertyDescriptor(scope, name);
      let reads = 0;
      const host = document.createElement('div');
      Object.defineProperty(scope, name, {
        configurable: true,
        get() {
          reads++;
          throw Error('native getter');
        },
      });
      try {
        expect(() => mount(host, base(), () => {})).toThrow(
          'refuses native host globals',
        );
        expect(host.childNodes.length).toBe(0);
        expect(reads).toBe(0);
      } finally {
        if (old) Object.defineProperty(scope, name, old);
        else Reflect.deleteProperty(scope, name);
      }
    });

test(`${selected}: empty choices have accessible names without altering visible text or payload`, async () => {
  const h = await make(base({ buttons: ['', ' ', 'Named', ''] }));
  try {
    const buttons = [
      ...h.host.querySelectorAll<HTMLElement>('[data-alert-choice]'),
    ];
    expect(buttons.map((b) => b.textContent)).toEqual(['', ' ', 'Named', '']);
    expect(buttons[0].getAttribute('aria-label')).toBe('Empty choice 1');
    expect(buttons[3].getAttribute('aria-label')).toBe('Empty choice 4');
    expect(buttons[1].getAttribute('aria-label')).toBe('Empty choice 2');
    expect(buttons[2].hasAttribute('aria-label')).toBe(false);
    await h.settle(() => buttons[0].click());
    await h.settle(() => buttons[1].click());
    expect(h.calls).toEqual([
      ['choose', { choice: '' }],
      ['choose', { choice: ' ' }],
    ]);
  } finally {
    await h.destroy();
  }
});
