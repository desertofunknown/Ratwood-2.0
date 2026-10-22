import { expect, test } from 'bun:test';
const source = async (name: string) =>
  Bun.file(`${import.meta.dir}/../${name}`).text();
test('candidate imports production pure helpers, never native backend or shipment/stockpile actions', async () => {
  const model = await source('model.ts');
  expect(model).toContain('deriveTradeQuoteState');
  expect(model).toContain('computeFillTarget');
  expect(model).toContain('groupByCategory');
  for (const name of [
    'model.ts',
    'fixtures.ts',
    'ReactView.tsx',
    'SvelteView.svelte',
    'react-mount.tsx',
    'svelte-mount.ts',
  ]) {
    const text = await source(name);
    expect(text).not.toMatch(
      /\b(?:trade_import|trade_export|set_buy_price|set_sell_price|export_surplus_all|toggle_stockpile_accept)\b/,
    );
    expect(text).not.toMatch(
      /from\s+['"][^'"]*(?:\/backend|\/byond|\/layouts|\/assets)['"]/,
    );
    expect(text).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/,
    );
  }
  const fixtures = await source('fixtures.ts');
  expect(fixtures).toContain('No recorded quote');
  // No timers / automatic delivery in either component. Economic totals are rendered from the accepted response.
  for (const name of ['ReactView.tsx', 'SvelteView.svelte']) {
    const text = await source(name);
    expect(text).not.toMatch(/setTimeout|setInterval|deliverPreview\(/);
    expect(text).toContain('q.quote.total');
    expect(text).toContain('reprices at confirmation');
  }
});
