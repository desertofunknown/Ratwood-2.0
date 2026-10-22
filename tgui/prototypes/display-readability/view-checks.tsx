import './test-network';
import { expect, test } from 'bun:test';
import { flushSync as reactFlush } from 'react-dom';
import { flushSync } from '../crafting-workbench/svelte/node_modules/svelte/src/index-client.js';
import { paletteButton, toggleButton, viewSnapshot } from './dom-snapshot';
import { createSampleData } from './fixtures';
import {
  copyData,
  createController,
  type DeliverData,
  type SettingsCommand,
  type SettingsData,
} from './model';
import { assertDisconnected } from './network-guard';
import { preview } from './preview';
import { mountReact } from './react-mount';
import { createSample } from './sample';
import { mountSvelte } from './svelte-mount';
import { networkAttempts } from './test-network';

const mounts = { react: mountReact, svelte: mountSvelte };
type Arm = keyof typeof mounts;
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  flushSync();
  reactFlush(() => {});
};
async function session(arm: Arm, initial = createSampleData()) {
  const calls: SettingsCommand[] = [];
  const deliveries: DeliverData[] = [];
  const unsubscribed: DeliverData[] = [];
  const controller = createController({
    action: (...command) => {
      calls.push(command);
    },
    subscribe: (deliver) => {
      deliveries.push(deliver);
      return () => {
        unsubscribed.push(deliver);
      };
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  let unmount!: () => void;
  reactFlush(() => {
    unmount = mounts[arm](host, controller);
  });
  await settle();
  const deliver = async (data: SettingsData) => {
    reactFlush(() => deliveries.at(-1)!(data));
    await settle();
  };
  const initialWaiting = host.textContent;
  await deliver(initial);
  return {
    host,
    controller,
    calls,
    deliveries,
    unsubscribed,
    deliver,
    initialWaiting,
    async click(node: HTMLButtonElement) {
      reactFlush(() => node.click());
      await settle();
    },
    async dispose() {
      reactFlush(unmount);
      await settle();
      host.remove();
    },
  };
}

async function runJourney(arm: Arm) {
  const data = createSampleData();
  const s = await session(arm, data);
  expect(s.initialWaiting).toContain('Waiting for sample state.');
  expect(s.calls).toEqual([]);
  const snapshots = [viewSnapshot(s.host)];
  expect(snapshots[0].categories.map((category) => category.name)).toEqual([
    'Graphics',
    'Visuals',
  ]);
  expect(s.host.querySelectorAll('[data-toggle-id]')).toHaveLength(13);
  expect(s.host.querySelectorAll('[data-option-value]')).toHaveLength(4);
  for (const category of data.categories) {
    for (const entry of category.entries) {
      const button = toggleButton(s.host, entry.id);
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-pressed')).toBe(
        String(Boolean(entry.enabled)),
      );
      expect(button.querySelector('[aria-hidden]')!.textContent).toBe(
        entry.enabled ? 'On' : 'Off',
      );
      const description = s.host.querySelector(
        `[id="${button.getAttribute('aria-describedby')}"]`,
      );
      expect(description?.textContent).toBe(entry.desc);
      button.focus();
      await s.click(button);
      expect(document.activeElement).toBe(button);
      expect(s.calls.at(-1)).toEqual(['toggle', { id: entry.id }]);
      expect(viewSnapshot(s.host)).toEqual(snapshots[0]);
    }
  }
  expect(s.calls).toHaveLength(13);
  for (const option of data.categories[0].selects![0].options) {
    const button = paletteButton(s.host, option.value);
    button.focus();
    await s.click(button);
    expect(document.activeElement).toBe(button);
    expect(s.calls.at(-1)).toEqual([
      'select',
      { id: 'hud_colorblind_palette', value: option.value },
    ]);
    expect(viewSnapshot(s.host)).toEqual(snapshots[0]);
  }
  // Existing selected palette remains activatable, including repeated activations.
  await s.click(paletteButton(s.host, 'none'));
  await s.click(paletteButton(s.host, 'none'));
  expect(s.calls.slice(-2)).toEqual([
    ['select', { id: 'hud_colorblind_palette', value: 'none' }],
    ['select', { id: 'hud_colorblind_palette', value: 'none' }],
  ]);
  await s.click(toggleButton(s.host, 'no_redflash'));
  await s.click(toggleButton(s.host, 'no_redflash'));
  expect(s.calls.slice(-2)).toEqual([
    ['toggle', { id: 'no_redflash' }],
    ['toggle', { id: 'no_redflash' }],
  ]);
  // Unchanged delivery is not a save acknowledgement and must not infer success.
  await s.deliver(data);
  expect(viewSnapshot(s.host)).toEqual(snapshots[0]);
  const retained = s.controller.snapshot().data!;
  data.categories[0].entries[0].enabled = 1;
  data.categories[0].selects![0].value = 'protan';
  data.categories[0].selects![0].options[1].label =
    'Long synthetic option & <text>';
  await s.deliver(data);
  expect(retained.categories[0].entries[0].enabled).toBe(0);
  expect(s.controller.snapshot().data).not.toBe(data);
  expect(
    s.controller.snapshot().data!.categories[0].selects![0].options,
  ).not.toBe(data.categories[0].selects![0].options);
  expect(toggleButton(s.host, 'fullscreen').getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(paletteButton(s.host, 'protan').getAttribute('aria-pressed')).toBe(
    'true',
  );
  snapshots.push(viewSnapshot(s.host));
  // Re-delivered original values remain authoritative, even after newer values.
  await s.deliver(createSampleData());
  expect(viewSnapshot(s.host)).toEqual(snapshots[0]);
  await s.dispose();
  return { snapshots, calls: s.calls };
}

test('mounted React and compiled Svelte preserve authoritative state, exact repeated commands, descriptions and focus', async () => {
  expect(await runJourney('react')).toEqual(await runJourney('svelte'));
  expect(networkAttempts()).toBe(0);
});

for (const arm of ['react', 'svelte'] as const) {
  test(`${arm}: same-reference nested updates, removed rows/options, omitted selects and empty categories`, async () => {
    const data = createSampleData();
    const s = await session(arm, data);
    data.categories[0].entries[0].label =
      '<script>not executable</script> ' + 'Long label '.repeat(20);
    data.categories[0].entries[0].desc = 'Long description '.repeat(40);
    await s.deliver(data);
    expect(toggleButton(s.host, 'fullscreen').textContent).toContain(
      '<script>not executable</script>',
    );
    expect(s.host.querySelector('script')).toBeNull();
    const first = viewSnapshot(s.host);
    data.categories[0].entries[0].enabled = true;
    expect(viewSnapshot(s.host)).toEqual(first);
    await s.deliver(data);
    expect(
      toggleButton(s.host, 'fullscreen').getAttribute('aria-pressed'),
    ).toBe('true');
    data.categories[0].entries.splice(1, 2);
    data.categories[0].selects![0].options.splice(1, 2);
    await s.deliver(data);
    expect(s.host.querySelectorAll('[data-toggle-id]')).toHaveLength(11);
    expect(s.host.querySelectorAll('[data-option-value]')).toHaveLength(2);
    data.categories[0].selects = undefined;
    data.categories[1].entries = [];
    await s.deliver(data);
    expect(s.host.querySelectorAll('fieldset')).toHaveLength(0);
    expect(s.host.querySelectorAll('[data-category-name]')).toHaveLength(2);
    await s.deliver({ categories: [] });
    expect(s.host.querySelectorAll('button')).toHaveLength(0);
    expect(s.host.querySelectorAll('[data-category-name]')).toHaveLength(0);
    await s.dispose();
  });

  test(`${arm}: close/reopen and unmount fence obsolete deliveries without invented lifecycle commands`, async () => {
    const s = await session(arm);
    const oldDelivery = s.deliveries[0];
    const oldButton = toggleButton(s.host, 'crt');
    reactFlush(() => s.controller.close());
    await settle();
    expect(s.controller.snapshot()).toEqual({ open: false });
    expect(s.unsubscribed).toEqual([oldDelivery]);
    s.controller.toggle('crt');
    s.controller.select('hud_colorblind_palette', 'none');
    oldDelivery(createSampleData());
    expect(s.calls).toEqual([]);
    expect(s.controller.snapshot()).toEqual({ open: false });
    reactFlush(() => s.controller.open());
    await settle();
    expect(s.deliveries).toHaveLength(2);
    const next = createSampleData();
    next.categories[0].entries[0].enabled = true;
    await s.deliver(next);
    const fresh = viewSnapshot(s.host);
    reactFlush(() => oldDelivery(createSampleData()));
    await settle();
    expect(viewSnapshot(s.host)).toEqual(fresh);
    await s.dispose();
    oldButton.click();
    s.controller.toggle('crt');
    s.deliveries[1](createSampleData());
    expect(s.calls).toEqual([]);
    expect(s.controller.snapshot()).toEqual({ open: false });
  });

  test(`${arm}: pending sample deliveries, repeated inversions, selected options and disposal`, async () => {
    const source = createSample();
    const calls: SettingsCommand[] = [];
    const controller = createController({
      subscribe: source.subscribe,
      action: (...command) => {
        calls.push(command);
        source.action(...command);
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    let unmount!: () => void;
    reactFlush(() => {
      unmount = mounts[arm](host, controller);
    });
    await settle();
    const first = viewSnapshot(host);
    reactFlush(() => {
      toggleButton(host, 'fullscreen').click();
      toggleButton(host, 'fullscreen').click();
    });
    await settle();
    expect(source.pendingCount()).toBe(2);
    expect(viewSnapshot(host)).toEqual(first);
    reactFlush(() => source.deliverNext());
    await settle();
    expect(toggleButton(host, 'fullscreen').getAttribute('aria-pressed')).toBe(
      'true',
    );
    reactFlush(() => source.deliverNext());
    await settle();
    expect(viewSnapshot(host)).toEqual(first);
    reactFlush(() => paletteButton(host, 'none').click());
    await settle();
    expect(source.pendingCount()).toBe(1);
    expect(calls.at(-1)).toEqual([
      'select',
      { id: 'hud_colorblind_palette', value: 'none' },
    ]);
    source.dispose();
    expect(source.deliverNext()).toBe(false);
    expect(source.pendingCount()).toBe(0);
    source.action('toggle', { id: 'crt' });
    expect(source.pendingCount()).toBe(0);
    reactFlush(unmount);
    await settle();
    host.remove();
  });

  test(`${arm}: sample notice, visible delivery/lifecycle controls and clean reopen`, async () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<header id="controls"></header><main id="root"></main>';
    document.body.append(wrapper);
    let cleanup!: () => void;
    reactFlush(() => {
      cleanup = preview(mounts[arm]);
    });
    await settle();
    const root = wrapper.querySelector<HTMLElement>('#root')!;
    const buttons =
      wrapper.querySelectorAll<HTMLButtonElement>('#controls button');
    const [deliver, close] = buttons;
    expect(wrapper.querySelector('h1')?.textContent).toBe(
      'Disconnected sample only',
    );
    expect(deliver.textContent).toBe('Deliver next sample update');
    expect(deliver.disabled).toBe(true);
    reactFlush(() => toggleButton(root, 'fullscreen').click());
    await settle();
    expect(deliver.disabled).toBe(false);
    expect(toggleButton(root, 'fullscreen').getAttribute('aria-pressed')).toBe(
      'false',
    );
    reactFlush(() => deliver.click());
    await settle();
    expect(toggleButton(root, 'fullscreen').getAttribute('aria-pressed')).toBe(
      'true',
    );
    reactFlush(() => close.click());
    await settle();
    expect(close.textContent).toBe('Reopen sample');
    expect(root.querySelector('button')).toBeNull();
    reactFlush(() => close.click());
    await settle();
    expect(toggleButton(root, 'fullscreen').getAttribute('aria-pressed')).toBe(
      'false',
    );
    reactFlush(cleanup);
    await settle();
    expect(wrapper.textContent).toBe('');
    close.click();
    deliver.click();
    expect(wrapper.textContent).toBe('');
    wrapper.remove();
  });
}

test('nested copying retains optional selects and isolates caller mutations', () => {
  const data = createSampleData();
  const copied = copyData(data);
  expect(copied).toEqual(data);
  expect(copied).not.toBe(data);
  data.categories[0].entries[0].label = 'changed';
  data.categories[0].selects![0].options[0].label = 'changed';
  expect(copied.categories[0].entries[0].label).toBe('Fullscreen');
  expect(copied.categories[0].selects![0].options[0].label).toBe('Default');
  expect('selects' in copied.categories[1]).toBe(false);
});

test('reentrant close during subscribe cleans up and fences delivery', () => {
  let stopped = 0;
  let oldDelivery!: DeliverData;
  const calls: SettingsCommand[] = [];
  const controller = createController({
    action: (...command) => {
      calls.push(command);
    },
    subscribe: (deliver) => {
      oldDelivery = deliver;
      controller.close();
      return () => {
        stopped++;
      };
    },
  });
  controller.open();
  oldDelivery(createSampleData());
  expect(stopped).toBe(1);
  expect(controller.snapshot()).toEqual({ open: false });
  expect(calls).toEqual([]);
});

test('native host presence fails closed, including inherited, undefined, separate-window and late presence', async () => {
  for (const name of ['Byond', 'hubStorage']) {
    expect(() => assertDisconnected({ [name]: undefined })).toThrow(
      'refuses native host globals',
    );
    expect(() =>
      assertDisconnected(Object.create({ [name]: undefined })),
    ).toThrow();
    expect(() =>
      assertDisconnected({ window: { [name]: undefined } }),
    ).toThrow();
    expect(() =>
      assertDisconnected({ window: Object.create({ [name]: undefined }) }),
    ).toThrow();
    const own = Object.getOwnPropertyDescriptor(globalThis, name);
    const source = createSample();
    let delivery!: DeliverData;
    const controller = createController({
      action: () => {},
      subscribe: (next) => {
        delivery = next;
        return () => {};
      },
    });
    controller.open();
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: undefined,
      });
      expect(() => createSample()).toThrow();
      expect(() =>
        createController({ action: () => {}, subscribe: () => () => {} }),
      ).toThrow();
      expect(() =>
        mounts.react(document.createElement('div'), controller),
      ).toThrow();
      expect(() =>
        mounts.svelte(document.createElement('div'), controller),
      ).toThrow();
      expect(() => controller.toggle('crt')).toThrow();
      expect(() =>
        controller.select('hud_colorblind_palette', 'none'),
      ).toThrow();
      expect(() => delivery(createSampleData())).toThrow();
      expect(() => source.deliverNext()).toThrow();
      expect(() => source.action('toggle', { id: 'crt' })).toThrow();
    } finally {
      if (own) Object.defineProperty(globalThis, name, own);
      else Reflect.deleteProperty(globalThis, name);
    }
    source.dispose();
    controller.close();
  }
  expect(networkAttempts()).toBe(0);
});
