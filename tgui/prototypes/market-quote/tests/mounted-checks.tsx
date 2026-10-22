import { expect, test } from 'bun:test';
import { mountReact } from '../react-mount';
import { mountSvelte } from '../svelte-mount';
import { createMarketController } from '../model';
import {
  installTripwires,
  attempted,
} from '../../selection-prompt/tests/tripwires';
installTripwires(false);
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
for (const [arm, mount] of Object.entries({
  React: mountReact,
  Svelte: mountSvelte,
})) {
  async function setup(sample = 'best-regions') {
    const host = document.createElement('div');
    document.body.append(host);
    const c = createMarketController(sample);
    const unmount = mount(host, c);
    await pause();
    const query = (selector: string) => {
      const node = host.querySelector<HTMLElement>(selector);
      if (!node) throw Error(`Missing ${selector}`);
      return node;
    };
    const click = async (selector: string) => {
      query(selector).click();
      await pause();
    };
    const change = async (value: string) => {
      const input = query('[data-quote-quantity]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await pause();
    };
    const update = async (action: () => void) => {
      action();
      await pause();
    };
    const destroy = async () => {
      c.dispose();
      unmount();
      await pause();
      host.remove();
    };
    return { host, c, query, click, change, update, destroy };
  }
  test(`${arm}: mounted category/route subset agrees with actual MarketView oracle`, async () => {
    const t = await setup();
    try {
      const oracle = await Bun.file(process.env.MARKET_ORACLE_PATH!).json();
      expect(
        [...t.host.querySelectorAll('[data-market-category]')].map((b) =>
          b.textContent?.trim(),
        ),
      ).toEqual(oracle.categories);
      expect(
        [...t.host.querySelectorAll('[data-market-region]')].map((b) => [
          b.getAttribute('data-market-side'),
          b.getAttribute('data-market-region'),
        ]),
      ).toEqual([
        ['import', 'north'],
        ['export', 'south'],
      ]);
      // Disclosure may be combined in the inspector; only route ordering/payloads are compared.
      for (const toggle of [
        ...t.host.querySelectorAll<HTMLElement>('[data-market-expand]'),
      ]) {
        toggle.click();
        await pause();
      }
      const requests = [];
      for (const [side, region] of [
        ['import', 'north'],
        ['import', 'east'],
        ['export', 'south'],
        ['export', 'north'],
      ]) {
        await t.click(
          `[data-market-side="${side}"][data-market-region="${region}"]`,
        );
        requests.push(t.c.snapshot().request);
        await t.click('[data-quote-back]');
      }
      expect(requests).toEqual(oracle.requests);
      await t.click('[data-market-category="basic_mineral"]');
      expect(
        t.query('[data-market-good]').getAttribute('data-market-good'),
      ).toBe('iron');
      await t.click('[data-market-category="gem_rare"]');
      expect(t.host.textContent?.toLowerCase()).toContain('not importable');
      expect(t.host.querySelectorAll('[data-market-region]').length).toBe(0);
      expect(attempted()).toEqual([]);
    } finally {
      await t.destroy();
    }
  });
  test(`${arm}: explicit delivery, raw quantity, stale details, fill, back/reopen and focus`, async () => {
    const t = await setup();
    try {
      const opener = t.query(
        '[data-market-side="import"][data-market-region="north"]',
      );
      opener.focus();
      opener.click();
      await pause();
      expect(document.activeElement).toBe(t.query('[data-quote-quantity]'));
      expect(t.c.snapshot().serverResponse).toBeNull();
      t.query('[data-quote-back]').focus();
      opener.click();
      await pause();
      expect(document.activeElement).toBe(t.query('[data-quote-quantity]'));
      expect(t.host.textContent).toContain('reprices at confirmation');
      await t.change('');
      expect(t.c.snapshot().draft.text).toBe('');
      expect(t.c.snapshot().quoteState?.validQuantity).toBe(false);
      await t.change('1.5');
      expect(t.c.snapshot().quoteState?.validQuantity).toBe(false);
      await t.change('1');
      await t.update(() => t.c.deliverPreview());
      expect(t.c.snapshot().quoteState?.quote?.total).toBe(10);
      const back = t.query('[data-quote-back]');
      back.focus();
      await t.update(() => t.c.deliverPreview('stale'));
      expect(document.activeElement).toBe(back);
      await t.change('10');
      expect(t.c.snapshot().quoteState?.quote).toBeNull();
      expect(t.host.textContent?.replace(/\s+/g, ' ')).toContain(
        'last accepted response',
      );
      const total = [...t.host.querySelectorAll('dt')].find(
        (n) => n.textContent === 'Total cost',
      )!;
      expect(total.nextElementSibling?.textContent).toBe('…');
      await t.update(() => t.c.deliverPreview());
      await t.click('[data-quote-fill]');
      expect(t.c.snapshot().draft.text).toBe('20');
      expect(t.c.snapshot().quoteState?.quote).toBeNull();
      await t.click('[data-quote-back]');
      expect(document.activeElement).toBe(opener);
      expect(t.c.snapshot().request).toBeNull();
      opener.click();
      await pause();
      expect(t.c.snapshot().draft.text).toBe('1');
      expect(t.c.snapshot().lastResponse).toBeNull();
      t.query('[data-quote-quantity]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await pause();
      expect(t.c.snapshot().request).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(attempted()).toEqual([]);
    } finally {
      await t.destroy();
    }
  });
  test(`${arm}: refusal/lock/empty samples and teardown are safely read-only`, async () => {
    const t = await setup();
    try {
      for (const [sample, issue] of [
        ['insufficient-purse', 'Treasury cannot cover'],
        ['insufficient-warrant', 'Warrant cannot cover'],
        ['sequestration', 'Commerce is in sequestration'],
      ]) {
        await t.update(() => t.c.selectSample(sample));
        await t.click(
          '[data-market-side="import"][data-market-region="north"]',
        );
        await t.update(() => t.c.deliverPreview());
        expect(t.host.textContent).toContain(issue);
      }
      expect(
        (t.query('[data-quote-quantity]') as HTMLInputElement).disabled,
      ).toBe(true);
      expect(document.activeElement).toBe(t.query('[data-quote-back]'));
      await t.update(() => t.c.selectSample('empty-market'));
      expect(t.host.textContent).toContain('No goods accepted at present.');
      expect(t.host.querySelectorAll('[data-market-region]').length).toBe(0);
      expect(
        [...t.host.querySelectorAll('button')].some((b) =>
          /Export Surplus|Auto-Price|Confirm/.test(b.textContent ?? ''),
        ),
      ).toBe(false);
      expect(attempted()).toEqual([]);
    } finally {
      await t.destroy();
    }
    t.c.openQuote({ side: 'import', regionId: 'north', goodId: 'wheat' });
    expect(t.c.snapshot().request).toBeNull();
    expect(t.host.childElementCount).toBe(0);
  });
}
