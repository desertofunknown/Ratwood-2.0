import { expect, test } from 'bun:test';
import { attempted, installTripwires } from './tripwires';
import {
  base,
  click,
  focus,
  runScenarios,
  state,
  type as typeDraft,
  type Call,
  type Factory,
} from './scenarios';
import { createReactValuePrompt } from '../react-mount';
import { createSvelteValuePrompt } from '../svelte-mount';
import { createController } from '../model';
import { assertDisconnected } from '../../selection-prompt/network-guard';

installTripwires(false);
// Happy DOM can report listener exceptions without rejecting dispatchEvent.
// Keep the original diagnostics visible and make them fatal to this harness.
const runtimeErrors: string[] = [];
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  runtimeErrors.push(args.map(String).join(' '));
  originalConsoleError(...args);
};
window.addEventListener('error', (event) => {
  runtimeErrors.push(event.message || String(event.error));
});
const pause = () => new Promise<void>((done) => setTimeout(done, 12));
const factories = {
  React: createReactValuePrompt,
  Svelte: createSvelteValuePrompt,
};
const selected = process.env.VALUE_FRAMEWORK;
if (selected !== 'React' && selected !== 'Svelte')
  throw Error(
    'Run via tests/run.ts: each framework requires a fresh subprocess.',
  );
const mount = factories[selected];
const make: Factory = async (kind, data) => {
  const host = document.createElement('div');
  document.body.append(host);
  const calls: Call[] = [];
  const session = mount(host, kind, data, (action, params) =>
    calls.push([action, params ?? {}]),
  );
  const settle = async (action?: () => void) => {
    action?.();
    await pause();
  };
  // Observe scheduled autofocus, never synthesize it: cold React scheduling may
  // take more than one timer turn before the leaf effect installs its own timer.
  let focused = false;
  for (let turn = 0; turn < 40; turn++) {
    await settle();
    const input = host.querySelector('input[type="number"],textarea');
    if (input && document.activeElement === input) {
      focused = true;
      break;
    }
  }
  if (!focused) {
    session.destroy();
    host.remove();
    throw Error(
      `${selected}/${kind}: mounted editor did not autofocus within 480 ms.`,
    );
  }
  return {
    host,
    calls,
    settle,
    update: async (patch) => settle(() => session.update(patch)),
    destroy: async () => {
      session.destroy();
      await pause();
      host.remove();
    },
  };
};

test(`${selected}: exact production DOM/event/native-validity parity`, async () => {
  const actual = JSON.parse(JSON.stringify(await runScenarios(make)));
  if (!process.env.VALUE_ORACLE_PATH)
    throw Error('Missing independent production oracle.');
  const expected = await Bun.file(process.env.VALUE_ORACLE_PATH).json();
  if (process.env.VALUE_CANDIDATE_PATH)
    await Bun.write(
      process.env.VALUE_CANDIDATE_PATH,
      JSON.stringify(actual, null, 2),
    );
  expect(Object.keys(expected)).toHaveLength(24);
  expect(
    Object.values(expected).reduce(
      (n: number, values: any) => n + values.length,
      0,
    ),
  ).toBe(140);
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  for (const scenario of Object.keys(expected))
    expect(actual[scenario], `${selected} / ${scenario}`).toEqual(
      expected[scenario],
    );
  expect(attempted()).toEqual([]);
  console.log(
    `${selected} matched 24 production scenarios / 140 observations.`,
  );
}, 30000);

test(`${selected}: numeric minimum recovery restores native validity and footer`, async () => {
  const h = await make('number', base('number'));
  try {
    await typeDraft(h, '11');
    expect(state(h).validity.valid).toBe(false);
    await focus(h, 'min');
    await click(h, 'min');
    expect(state(h).draft).toBe('0');
    expect(state(h).validity.valid).toBe(true);
    expect(state(h).disabled.confirm).toBe(false);
    await click(h, 'confirm');
    expect(h.calls).toEqual([['submit', { entry: 0 }]]);
  } finally {
    await h.destroy();
  }
});

for (const kind of ['number', 'text'] as const) {
  test(`${selected}/${kind}: delivery retains draft; fresh remount resets it`, async () => {
    const first = await make(kind, base(kind));
    try {
      await typeDraft(first, kind === 'number' ? '7' : 'edited');
      await first.update(
        kind === 'number' ? { init_value: 2 } : { placeholder: 'replacement' },
      );
      expect(state(first).draft).toBe(kind === 'number' ? '7' : 'edited');
      await click(first, 'confirm');
      expect(first.calls).toEqual([
        ['submit', { entry: kind === 'number' ? 7 : 'edited' }],
      ]);
    } finally {
      await first.destroy();
    }
    const next = await make(
      kind,
      base(
        kind,
        kind === 'number' ? { init_value: 2 } : { placeholder: 'replacement' },
      ),
    );
    try {
      expect(state(next).draft).toBe(kind === 'number' ? '2' : 'replacement');
    } finally {
      await next.destroy();
    }
  });

  test(`${selected}/${kind}: close is local; stale DOM and controller actions are inert`, async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const calls: Call[] = [];
    let closes = 0;
    const session = mount(
      host,
      kind,
      base(kind),
      (action, params) => calls.push([action, params ?? {}]),
      () => closes++,
    );
    await pause();
    const stale = host.querySelector<HTMLElement>('[data-testid="confirm"]')!;
    host.querySelector<HTMLElement>('[data-testid="close"]')!.click();
    await pause();
    expect(closes).toBe(1);
    expect(calls).toEqual([]);
    expect(host.textContent).toBe('');
    const closed = session.controller.snapshot();
    stale.click();
    session.controller.submit();
    session.controller.cancel();
    session.controller.setValue(kind === 'number' ? 8 : 'stale');
    session.controller.adjust(1);
    session.controller.reset();
    session.update({ timeout: 0.5 });
    session.destroy();
    session.destroy();
    await pause();
    expect(session.controller.snapshot()).toBe(closed);
    expect(calls).toEqual([]);
    expect(closes).toBe(1);
    expect(attempted()).toEqual([]);
    host.remove();
  });
}

for (const name of ['Byond', 'hubStorage']) {
  for (const scopeName of ['global', 'window']) {
    test(`${selected}: rejects ${scopeName}.${name} before mount without reading it`, () => {
      const scope = scopeName === 'global' ? globalThis : window;
      const previous = Object.getOwnPropertyDescriptor(scope, name);
      let reads = 0;
      const host = document.createElement('div');
      Object.defineProperty(scope, name, {
        configurable: true,
        get() {
          reads++;
          throw Error('Native getter read');
        },
      });
      try {
        expect(() => mount(host, 'number', base('number'), () => {})).toThrow(
          'refuses native host globals',
        );
        expect(host.childNodes.length).toBe(0);
        expect(reads).toBe(0);
      } finally {
        if (previous) Object.defineProperty(scope, name, previous);
        else Reflect.deleteProperty(scope, name);
      }
    });
  }
  test(`${selected}: inherited, undefined and late ${name} endpoints cannot emit`, () => {
    expect(() =>
      assertDisconnected(Object.create({ [name]: undefined })),
    ).toThrow();
    const c = createController('text', {}, () => {
      throw Error('Action escaped guard');
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => c.submit()).toThrow('refuses native host globals');
      expect(() => c.deliver({ timeout: 0 })).toThrow(
        'refuses native host globals',
      );
    } finally {
      Reflect.deleteProperty(globalThis, name);
      c.close();
    }
    expect(attempted()).toEqual([]);
  });
}

test(`${selected}: no swallowed runtime errors or forbidden effects`, () => {
  expect(runtimeErrors).toEqual([]);
  expect(attempted()).toEqual([]);
});
