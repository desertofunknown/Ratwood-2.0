// Isolated process: actual production MarketView, with backend action spy.
import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MARKET_SAMPLES } from '../fixtures';
import type { Data } from '../../../packages/tgui/interfaces/StewardTrade/types';
Reflect.set(globalThis, 'Byond', { windowId: 'market-quote-isolated-oracle' });
const backend = await import('../../../packages/tgui/backend');
const { MarketView } = await import(
  '../../../packages/tgui/interfaces/StewardTrade/MarketView'
);
Reflect.deleteProperty(globalThis, 'Byond');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
test('actual MarketView oracle: category order, best/alternative route payloads; no management actions exercised', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const calls: unknown[] = [];
  const requests: unknown[] = [];
  const data = MARKET_SAMPLES[0].data as Data;
  const spy = spyOn(backend, 'useBackend').mockImplementation((() => ({
    data,
    act: (...args: unknown[]) => calls.push(args),
  })) as any);
  try {
    await act(async () =>
      root.render(<MarketView data={data} onTrade={(r) => requests.push(r)} />),
    );
    const categories = [...host.querySelectorAll('button[aria-pressed]')]
      .filter((b) => /\(1\)$/.test(b.textContent ?? ''))
      .map((b) => b.textContent?.trim());
    const groups = ['Buy Wheat', 'Sell Wheat'];
    for (const name of groups) {
      const group = host.querySelector(`[role="group"][aria-label="${name}"]`)!;
      const side = name.startsWith('Buy') ? 'Import' : 'Export';
      await act(async () =>
        [...group.querySelectorAll('button')]
          .find((b) => b.textContent?.trim() === side)!
          .click(),
      );
      await act(async () =>
        [...group.querySelectorAll('button')]
          .find((b) => b.textContent?.includes('Other regions'))!
          .click(),
      );
      await act(async () =>
        [
          ...group.querySelectorAll<HTMLButtonElement>(
            `button[aria-label^="${side} Wheat"]`,
          ),
        ]
          .at(-1)!
          .click(),
      );
    }
    expect(calls).toEqual([]);
    expect(requests).toEqual([
      { side: 'import', regionId: 'north', goodId: 'wheat' },
      { side: 'import', regionId: 'east', goodId: 'wheat' },
      { side: 'export', regionId: 'south', goodId: 'wheat' },
      { side: 'export', regionId: 'north', goodId: 'wheat' },
    ]);
    await Bun.write(
      `${import.meta.dir}/.generated/market-oracle.json`,
      JSON.stringify({ categories, requests }),
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    spy.mockRestore();
  }
});
