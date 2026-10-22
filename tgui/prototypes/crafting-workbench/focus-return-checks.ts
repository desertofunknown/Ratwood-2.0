import { expect, spyOn, test } from 'bun:test';

import { PAGE_SIZE, type WorkbenchData } from './model';

type Harness = {
  container: () => HTMLElement;
  render: (patch?: Partial<WorkbenchData>) => Promise<void>;
  click: (element: HTMLElement) => Promise<void>;
  backWithRemovedRecipes: (back: HTMLButtonElement) => Promise<void>;
};

/** Matched call-contract checks only: Happy DOM cannot establish scroll geometry. */
export function focusReturnChecks(harness: Harness) {
  // Boolean identity checks avoid recursively dumping the entire DOM on failure.
  const rows = () => [
    ...harness
      .container()
      .querySelectorAll<HTMLButtonElement>('.Workbench__recipe'),
  ];
  const back = () =>
    harness.container().querySelector<HTMLButtonElement>('.Workbench__back')!;
  const list = () =>
    harness.container().querySelector<HTMLDivElement>('.Workbench__list')!;
  const search = () =>
    harness
      .container()
      .querySelector<HTMLInputElement>('input[type="search"]')!;
  const revealOptions: ScrollIntoViewOptions = {
    block: 'nearest',
    inline: 'nearest',
    behavior: 'instant',
  };

  test('Back focuses the exact variant, restores the saved list position, then requests instant nearest visibility once', async () => {
    await harness.render();
    const catalog = list();
    // Both variants share a label; identity rather than label chooses the target.
    const target = rows()[2];
    const trace: string[] = [];
    const originalFocus = target.focus;
    let scrollTop = 120;
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      catalog,
      'scrollTop',
    );
    Object.defineProperty(catalog, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        trace.push(`restore:${value}`);
        scrollTop = value;
      },
    });
    const focus = spyOn(target, 'focus').mockImplementation((options) => {
      trace.push(`focus:${scrollTop}`);
      expect(options).toEqual({ preventScroll: true });
      originalFocus.call(target, options);
    });
    let visibilityAdjustment = 0;
    const reveal = spyOn(
      HTMLElement.prototype,
      'scrollIntoView',
    ).mockImplementation(function (this: HTMLElement, options) {
      trace.push(`reveal:${scrollTop}`);
      expect(this === target).toBe(true);
      expect(document.activeElement === target).toBe(true);
      expect(options).toEqual(revealOptions);
      // Simulate a browser adjustment, not layout. Nothing may overwrite it after return.
      scrollTop += visibilityAdjustment;
    });
    try {
      for (visibilityAdjustment of [0, 17]) {
        scrollTop = 120;
        await harness.click(target);
        expect(
          document.activeElement ===
            harness.container().querySelector('.Workbench__folio-title'),
        ).toBe(true);
        scrollTop = 29;
        const callsBeforeBack = reveal.mock.calls.length;
        trace.length = 0;
        await harness.click(back());
        expect(trace).toEqual(['focus:29', 'restore:120', 'reveal:120']);
        expect(document.activeElement === target).toBe(true);
        expect(catalog.scrollTop).toBe(120 + visibilityAdjustment);
        expect(reveal).toHaveBeenCalledTimes(callsBeforeBack + 1);
        await harness.render();
        expect(trace).toEqual(['focus:29', 'restore:120', 'reveal:120']);
      }
      expect(focus).toHaveBeenCalledTimes(2);
      expect(reveal).toHaveBeenCalledTimes(2);
    } finally {
      focus.mockRestore();
      reveal.mockRestore();
      if (scrollDescriptor) {
        Object.defineProperty(catalog, 'scrollTop', scrollDescriptor);
      } else Reflect.deleteProperty(catalog, 'scrollTop');
    }
  });

  test('Back reveals search when its selected row disappears during the return', async () => {
    await harness.render();
    const catalog = list();
    catalog.scrollTop = 120;
    await harness.click(rows()[2]);
    catalog.scrollTop = 29;
    const input = search();
    const focus = spyOn(input, 'focus');
    const reveal = spyOn(
      HTMLElement.prototype,
      'scrollIntoView',
    ).mockImplementation(function (this: HTMLElement, options) {
      expect(this === input).toBe(true);
      expect(document.activeElement === input).toBe(true);
      expect(catalog.scrollTop).toBe(120);
      expect(options).toEqual(revealOptions);
    });
    try {
      await harness.backWithRemovedRecipes(back());
      expect(rows()).toHaveLength(0);
      expect(document.activeElement === input).toBe(true);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(reveal).toHaveBeenCalledTimes(1);
      await harness.render();
      expect(reveal).toHaveBeenCalledTimes(1);
    } finally {
      focus.mockRestore();
      reveal.mockRestore();
    }
  });

  test('mount, pagination, opening, neutral delivery and selection removal do not request Back visibility', async () => {
    const reveal = spyOn(
      HTMLElement.prototype,
      'scrollIntoView',
    ).mockImplementation(() => {});
    try {
      const recipes = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({
        name: `Recipe ${String(index).padStart(4, '0')}`,
        path: `/recipe/${index}`,
      }));
      await harness.render({ crafting_recipes: { Test: recipes } });
      await harness.render();
      await harness.click(
        harness
          .container()
          .querySelector<HTMLButtonElement>('.Workbench__more')!,
      );
      expect(document.activeElement === rows()[PAGE_SIZE]).toBe(true);
      await harness.click(rows()[PAGE_SIZE]);
      const heading = harness
        .container()
        .querySelector('.Workbench__folio-title');
      expect(document.activeElement === heading).toBe(true);
      recipes[PAGE_SIZE].name = 'Updated selection';
      await harness.render();
      expect(document.activeElement === heading).toBe(true);
      await harness.render({ crafting_recipes: {} });
      expect(document.activeElement === search()).toBe(true);
      // Removing another selection must not steal focus from an active filter.
      await harness.render({ crafting_recipes: { Test: recipes } });
      await harness.click(rows()[0]);
      const select = harness.container().querySelector('select')!;
      select.focus();
      await harness.render({ crafting_recipes: {} });
      expect(document.activeElement === select).toBe(true);
      expect(reveal).not.toHaveBeenCalled();
    } finally {
      reveal.mockRestore();
    }
  });
}
