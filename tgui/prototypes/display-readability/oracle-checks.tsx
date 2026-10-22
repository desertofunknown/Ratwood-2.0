import './test-network';

import { expect, mock, test } from 'bun:test';
import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { createSampleData } from './fixtures';
import {
  createController,
  type DeliverData,
  type SettingsCommand,
  type SettingsData,
} from './model';
import { mountReact } from './react-mount';
import { ReactView } from './ReactView';
import { networkAttempts } from './test-network';

// Run this file in its own Bun process. Only the native backend and window shell
// are replaced. The actual ToggleOptionsMenu, Tooltip, Table, Stack, Section and
// tgui-core Button/Checkbox controls (including repository adapters) stay intact.
let delivered: SettingsData = createSampleData();
let action = (..._command: SettingsCommand) => {};
mock.module('../../packages/tgui/backend', () => ({
  useBackend: () => ({ data: delivered, act: action }),
}));
const Shell = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module('../../packages/tgui/layouts', () => ({
  Window: Object.assign(Shell, { Content: Shell }),
}));
const { ToggleOptionsMenu } = await import(
  '../../packages/tgui/interfaces/ToggleOptionsMenu'
);

type Arm = 'original' | 'candidate';
type Control =
  | { kind: 'toggle'; label: string; enabled: boolean }
  | {
      kind: 'select';
      label: string;
      options: { label: string; selected: boolean }[];
    };
type Snapshot = { name: string; controls: Control[] }[];
const text = (element: Element | null) => element?.textContent?.trim() ?? '';

function snapshot(host: HTMLElement, arm: Arm): Snapshot {
  if (arm === 'original') {
    return Array.from(host.querySelectorAll('.Section')).map((section) => ({
      name: text(section.querySelector('.Section__titleText')),
      controls: Array.from(section.querySelectorAll('.Table__row')).map(
        (row): Control => {
          const checkbox = row.querySelector('.Button--fluid');
          if (checkbox) {
            return {
              kind: 'toggle',
              label: text(checkbox),
              enabled: checkbox.classList.contains('Button--selected'),
            };
          }
          return {
            kind: 'select',
            label: text(row.querySelector('.Stack__item')),
            options: Array.from(row.querySelectorAll('.Button')).map(
              (option) => ({
                label: text(option),
                selected: option.classList.contains('Button--selected'),
              }),
            ),
          };
        },
      ),
    }));
  }
  return Array.from(host.querySelectorAll('[data-category-name]')).map(
    (section) => ({
      name: text(section.querySelector('h3')),
      controls: Array.from(section.querySelectorAll('[data-setting-id]')).map(
        (row): Control => {
          const button = row.querySelector('[data-toggle-id]');
          if (button) {
            const copy = button.cloneNode(true) as HTMLElement;
            copy
              .querySelectorAll('[aria-hidden="true"]')
              .forEach((element) => element.remove());
            return {
              kind: 'toggle',
              label: text(copy),
              enabled: button.getAttribute('aria-pressed') === 'true',
            };
          }
          return {
            kind: 'select',
            label: text(row.querySelector('legend')),
            options: Array.from(
              row.querySelectorAll('[data-option-value]'),
            ).map((option) => ({
              label: text(option),
              selected: option.getAttribute('aria-pressed') === 'true',
            })),
          };
        },
      ),
    }),
  );
}

function expectedSnapshot(data: SettingsData): Snapshot {
  return data.categories.map((category) => ({
    name: category.name,
    controls: [
      ...category.entries.map(
        (entry): Control => ({
          kind: 'toggle',
          label: entry.label,
          enabled: Boolean(entry.enabled),
        }),
      ),
      ...(category.selects || []).map(
        (entry): Control => ({
          kind: 'select',
          label: entry.label,
          options: (Array.isArray(entry.options) ? entry.options : []).map(
            (option) => ({
              label: option.label,
              selected: entry.value === option.value,
            }),
          ),
        }),
      ),
    ],
  }));
}

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
async function mounted<T>(
  arm: Arm,
  data: SettingsData,
  run: (host: HTMLDivElement) => T | Promise<T>,
) {
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const calls: SettingsCommand[] = [];
  try {
    delivered = data;
    action = (...command) => {
      calls.push(command);
    };
    await act(async () =>
      root.render(
        arm === 'original' ? (
          <ToggleOptionsMenu />
        ) : (
          <ReactView
            data={data}
            onToggle={(id) => action('toggle', { id })}
            onSelect={(id, value) => action('select', { id, value })}
          />
        ),
      ),
    );
    expect(calls).toEqual([]);
    return await run(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    action = () => {};
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

function cases(): SettingsData[] {
  const reordered = createSampleData();
  reordered.categories.reverse();
  reordered.categories.forEach((category) => category.entries.reverse());
  reordered.categories[1].selects![0].options.reverse();
  reordered.categories[1].selects![0].value = 'tritan';
  const missingSelects = createSampleData();
  delete missingSelects.categories[0].selects;
  const emptySelects = createSampleData();
  emptySelects.categories[0].selects = [];
  const emptyEntries = createSampleData();
  emptyEntries.categories.forEach((category) => {
    category.entries = [];
  });
  const emptyOptions = createSampleData();
  emptyOptions.categories[0].selects![0].options = [];
  const unknownValue = createSampleData();
  unknownValue.categories[0].selects![0].value = 'unrecognized-delivery';
  const literalText = createSampleData();
  literalText.categories[0].entries[0].label =
    '<script>synthetic label</script> & <b>not HTML</b>';
  literalText.categories[0].entries[0].desc =
    '<img src=x onerror=alert(1)> literal description';
  return [
    createSampleData(),
    reordered,
    missingSelects,
    emptySelects,
    emptyEntries,
    emptyOptions,
    unknownValue,
    literalText,
    { categories: [] },
  ];
}

test('actual unchanged menu and candidate preserve delivered category, row, option order, labels and selected states', async () => {
  for (const data of cases()) {
    const original = await mounted('original', data, (host) =>
      snapshot(host, 'original'),
    );
    const candidate = await mounted('candidate', data, (host) => {
      expect(host.querySelector('script, img')).toBeNull();
      return snapshot(host, 'candidate');
    });
    expect(original).toEqual(expectedSnapshot(data));
    expect(candidate).toEqual(original);
  }
});

test('actual checkbox polarity matches candidate for every toggle and all BooleanLike deliveries', async () => {
  for (const enabled of [false, true, 0, 1] as const) {
    const data = createSampleData();
    data.categories.forEach((category) =>
      category.entries.forEach((entry) => {
        entry.enabled = enabled;
      }),
    );
    const original = await mounted('original', data, (host) =>
      snapshot(host, 'original'),
    );
    const candidate = await mounted('candidate', data, (host) =>
      snapshot(host, 'candidate'),
    );
    expect(original).toEqual(expectedSnapshot(data));
    expect(candidate).toEqual(original);
  }
});

function control(
  host: HTMLElement,
  arm: Arm,
  label: string,
  id: string,
  optionValue?: string,
): HTMLElement {
  if (arm === 'original') {
    const found = Array.from(
      host.querySelectorAll<HTMLElement>('.Button'),
    ).filter((button) => text(button) === label);
    if (found.length !== 1)
      throw Error(
        `Expected one actual tgui-core control named ${label}, found ${found.length}`,
      );
    return found[0];
  }
  const selector =
    optionValue === undefined
      ? `[data-toggle-id="${id}"]`
      : `[data-select-id="${id}"] [data-option-value="${optionValue}"]`;
  const found = host.querySelector<HTMLElement>(selector);
  if (!found) throw Error(`Missing candidate control ${selector}`);
  expect(found.tagName).toBe('BUTTON');
  return found;
}

async function observed(arm: Arm) {
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  let data = createSampleData();
  const calls: SettingsCommand[] = [];
  const expectedCalls: SettingsCommand[] = [];
  const snapshots: Snapshot[] = [];
  let dispose: (() => void) | undefined;
  let deliver: DeliverData;
  let subscriptions = 0;
  let cleanups = 0;
  let disposed = false;
  try {
    if (arm === 'original') {
      const root = createRoot(host);
      dispose = () => root.unmount();
      action = (...command) => {
        calls.push(command);
      };
      deliver = (next) => {
        delivered = next;
        root.render(<ToggleOptionsMenu />);
      };
    } else {
      let nextDelivery!: DeliverData;
      const controller = createController({
        action: (...command) => {
          calls.push(command);
        },
        subscribe: (next) => {
          subscriptions++;
          nextDelivery = next;
          return () => {
            cleanups++;
          };
        },
      });
      await act(async () => {
        dispose = mountReact(host, controller);
      });
      expect(subscriptions).toBe(1);
      expect(host.textContent).toContain('Waiting for sample state.');
      // A real delivery callback, not a synthetic action or invented save result.
      deliver = (next) => nextDelivery(next);
    }
    await act(async () => deliver(data));
    expect(calls).toEqual([]);
    const remember = () => {
      const value = snapshot(host, arm);
      expect(value).toEqual(expectedSnapshot(data));
      snapshots.push(value);
    };
    remember();
    for (const category of data.categories) {
      for (const entry of category.entries) {
        for (let repeat = 0; repeat < 2; repeat++) {
          await act(async () =>
            control(host, arm, entry.label, entry.id).click(),
          );
          expectedCalls.push(['toggle', { id: entry.id }]);
          expect(calls).toEqual(expectedCalls);
          // No delivery means no optimistic change, even for negative labels.
          remember();
        }
      }
      for (const entry of category.selects || []) {
        for (const option of entry.options) {
          for (let repeat = 0; repeat < 2; repeat++) {
            await act(async () =>
              control(host, arm, option.label, entry.id, option.value).click(),
            );
            expectedCalls.push([
              'select',
              { id: entry.id, value: option.value },
            ]);
            expect(calls).toEqual(expectedCalls);
            remember();
          }
        }
      }
    }
    // A replacement payload is also authoritative and does not emit actions.
    data = createSampleData();
    data.categories.forEach((category) =>
      category.entries.forEach((entry) => {
        entry.enabled = false;
      }),
    );
    data.categories[0].selects![0].value = 'protan';
    await act(async () => deliver(data));
    remember();
    expect(calls).toEqual(expectedCalls);

    // Same object, category, entry, select and options references are delivered
    // after in-place changes. Pure object identity must not hide actual delivery.
    data.categories.forEach((category) =>
      category.entries.forEach((entry) => {
        entry.enabled = !entry.enabled;
      }),
    );
    const palette = data.categories[0].selects![0];
    palette.value = 'deuten';
    await act(async () => deliver(data));
    remember();
    expect(calls).toEqual(expectedCalls);
    const selected = palette.options.find(
      (option) => option.value === 'deuten',
    )!;
    await act(async () =>
      control(host, arm, selected.label, palette.id, selected.value).click(),
    );
    expectedCalls.push(['select', { id: palette.id, value: 'deuten' }]);
    expect(calls).toEqual(expectedCalls);
    remember();

    // Changing labels/order via another same-reference delivery is authoritative.
    data.categories.reverse();
    data.categories.forEach((category) => category.entries.reverse());
    palette.options.reverse();
    data.categories[0].entries[0].label = 'Synthetic delivered XP label';
    data.categories[0].entries[0].desc = 'Synthetic delivered description.';
    await act(async () => deliver(data));
    remember();
    const changed = data.categories[0].entries[0];
    await act(async () =>
      control(host, arm, changed.label, changed.id).click(),
    );
    expectedCalls.push(['toggle', { id: changed.id }]);
    expect(calls).toEqual(expectedCalls);
    remember();

    await act(async () => dispose!());
    disposed = true;
    if (arm === 'candidate') expect(cleanups).toBe(1);
    expect(calls).toEqual(expectedCalls); // no invented open/close/save command
    return { calls, snapshots };
  } finally {
    if (!disposed && dispose) await act(async () => dispose!());
    host.remove();
    action = () => {};
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

test('mounted actual-control oracle: exact DOM activation payload/order, repeated toggles, selected reactivation and same-reference delivery', async () => {
  expect(await observed('candidate')).toEqual(await observed('original'));
});

test('candidate intentionally exposes exact descriptions and semantic button states without changing source wording', async () => {
  const data = createSampleData();
  await mounted('candidate', data, (host) => {
    for (const category of data.categories) {
      const section = Array.from(
        host.querySelectorAll('[data-category-name]'),
      ).find(
        (element) =>
          element.getAttribute('data-category-name') === category.name,
      )!;
      const headingId = section.getAttribute('aria-labelledby');
      expect(document.getElementById(headingId!)?.textContent).toBe(
        category.name,
      );
      for (const entry of category.entries) {
        const button = control(host, 'candidate', entry.label, entry.id);
        expect(button.getAttribute('type')).toBe('button');
        expect(button.getAttribute('aria-pressed')).toBe(
          String(Boolean(entry.enabled)),
        );
        const desc = document.getElementById(
          button.getAttribute('aria-describedby')!,
        );
        expect(desc?.textContent).toBe(entry.desc);
        expect(desc?.tagName).toBe('P');
        expect(desc?.hasAttribute('hidden')).toBe(false);
      }
      for (const entry of category.selects || []) {
        const fieldset = section.querySelector(
          `[data-select-id="${entry.id}"]`,
        )!;
        expect(fieldset.tagName).toBe('FIELDSET');
        expect(text(fieldset.querySelector('legend'))).toBe(entry.label);
        expect(
          document.getElementById(fieldset.getAttribute('aria-describedby')!)
            ?.textContent,
        ).toBe(entry.desc);
        for (const option of entry.options) {
          const button = control(
            host,
            'candidate',
            option.label,
            entry.id,
            option.value,
          );
          expect(button.getAttribute('aria-pressed')).toBe(
            String(entry.value === option.value),
          );
          expect(
            document.getElementById(button.getAttribute('aria-describedby')!)
              ?.textContent,
          ).toBe(entry.desc);
        }
      }
    }
    expect(host.textContent).toContain('Current mob only in game');
    expect(host.textContent).toContain(
      'cannot verify saving or native effects',
    );
  });
});

test('isolated actual-component oracle made zero network attempts', () => {
  expect(networkAttempts()).toBe(0);
});
