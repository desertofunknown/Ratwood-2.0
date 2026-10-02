import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SearchBar } from '../interfaces/Goldface/SearchBar';
import type { VendingData } from '../interfaces/Goldface/types';
import { VendingPanel } from '../interfaces/Goldface/VendingPanel';

let container: HTMLDivElement;
let root: Root | undefined;
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
  previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const render = async (node: ReactNode) => {
  await act(async () => root!.render(node));
};

const searchInput = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;

const enter = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(searchInput(), value);
    searchInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const wait = async (milliseconds = 300) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
};

const clear = async () => {
  const button = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent === 'Clear',
  );
  if (!button) throw new Error('Missing Clear button');
  await act(async () => button.click());
};

describe('shared shop search', () => {
  test('debounces rapid input and sends the final search once', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('s');
    await wait(80);
    await enter('sw');
    await wait(80);
    expect(dispatch).not.toHaveBeenCalled();
    await enter('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([['set_search', { search: 'sword' }]]);
    await render(<SearchBar serverSearch="sword" searchRevision={1} act={dispatch} />);
    await wait();
    expect(dispatch.mock.calls).toHaveLength(1);
  });

  test('a delayed response preserves newer input and sends that draft exactly once', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('swo');
    await wait();
    expect(dispatch.mock.calls).toEqual([['set_search', { search: 'swo' }]]);
    await enter('sword');
    await render(<SearchBar serverSearch="swo" searchRevision={1} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'swo' }],
      ['set_search', { search: 'sword' }],
    ]);
    await render(<SearchBar serverSearch="sword" searchRevision={2} act={dispatch} />);
    await wait();
    expect(dispatch.mock.calls).toHaveLength(2);
  });

  test('server rerenders with new action callbacks do not postpone pending input', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('sword');
    for (let index = 0; index < 4; index++) {
      await wait(90);
      await render(<SearchBar serverSearch="" searchRevision={0} act={(action, params) => dispatch(action, params)} />);
    }
    expect(dispatch.mock.calls).toEqual([['set_search', { search: 'sword' }]]);
    await wait();
    expect(dispatch.mock.calls).toHaveLength(1);
  });

  test('Clear cancels an unsent draft', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('sword');
    await clear();
    expect(searchInput().value).toBe('');
    await wait();
    expect(dispatch.mock.calls).toEqual([['clear_search']]);
  });

  test('Clear cannot be undone by an older response arriving while newer input was pending', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('swo');
    await wait();
    await enter('sword');
    await clear();
    await render(<SearchBar serverSearch="swo" searchRevision={1} act={dispatch} />);
    expect(searchInput().value).toBe('');
    await wait();
    await render(<SearchBar serverSearch="" searchRevision={2} act={dispatch} />);
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'swo' }],
      ['clear_search'],
    ]);
    expect(searchInput().value).toBe('');
  });

  test('unmount cancels pending input', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('sword');
    await act(async () => root!.unmount());
    root = undefined;
    await wait();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('a coalesced blank Clear acknowledgement allows a later shared search for the cleared query', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('sword');
    await wait();
    await clear();
    // The server processed both actions but sent only its final blank state.
    await render(<SearchBar serverSearch="" searchRevision={2} act={dispatch} />);
    expect(searchInput().value).toBe('');
    await render(<SearchBar serverSearch="sword" searchRevision={3} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'sword' }],
      ['clear_search'],
    ]);
  });

  test('an earlier acknowledgement preserves the latest already-submitted search', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    await enter('swo');
    await wait();
    await enter('sword');
    await wait();
    await render(<SearchBar serverSearch="swo" searchRevision={1} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await render(<SearchBar serverSearch="sword" searchRevision={2} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'swo' }],
      ['set_search', { search: 'sword' }],
    ]);
  });

  test('repeated queries retain the latest intent across each earlier acknowledgement', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    for (const query of ['wood', 'sword', 'wood']) {
      await enter(query);
      await wait();
    }
    await render(<SearchBar serverSearch="wood" searchRevision={1} act={dispatch} />);
    expect(searchInput().value).toBe('wood');
    await render(<SearchBar serverSearch="sword" searchRevision={2} act={dispatch} />);
    expect(searchInput().value).toBe('wood');
    await render(<SearchBar serverSearch="wood" searchRevision={3} act={dispatch} />);
    expect(searchInput().value).toBe('wood');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'wood' }],
      ['set_search', { search: 'sword' }],
      ['set_search', { search: 'wood' }],
    ]);
  });

  test('a coalesced repeated-query acknowledgement settles before the next external search', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="" searchRevision={0} act={dispatch} />);
    for (const query of ['wood', 'sword', 'wood']) {
      await enter(query);
      await wait();
    }
    await render(<SearchBar serverSearch="wood" searchRevision={3} act={dispatch} />);
    expect(searchInput().value).toBe('wood');
    await render(<SearchBar serverSearch="sword" searchRevision={4} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['set_search', { search: 'wood' }],
      ['set_search', { search: 'sword' }],
      ['set_search', { search: 'wood' }],
    ]);
  });

  test('idle input adopts external shared-machine changes without submitting them again', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="sword" searchRevision={4} act={dispatch} />);
    await render(<SearchBar serverSearch="helmet" searchRevision={5} act={dispatch} />);
    expect(searchInput().value).toBe('helmet');
    await wait();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('an older server revision cannot replace the latest shared-machine search', async () => {
    const dispatch = mock();
    await render(<SearchBar serverSearch="sword" searchRevision={4} act={dispatch} />);
    await render(<SearchBar serverSearch="helmet" searchRevision={5} act={dispatch} />);
    await render(<SearchBar serverSearch="sword" searchRevision={4} act={dispatch} />);
    expect(searchInput().value).toBe('helmet');
    await wait();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('the automatic category acknowledgement preserves a search submitted during startup', async () => {
    const dispatch = mock();
    const data: VendingData = {
      motto: '', budget: 100, locked: false, is_public: true,
      is_proprietor: false, is_agent: false, can_read: true,
      tariff_rate_pct: 0, tariff_paid: 0, tariff_evaded: 0, dodging: false,
      categories: ['Tools', 'Weapons'], current_category: '', search: '',
      search_revision: 0,
      search_mode: false, result_cap: 100, total_matches: 0, packs: [],
      is_command_center: false,
    };
    await render(<VendingPanel data={data} act={dispatch} />);
    expect(dispatch.mock.calls).toEqual([['changecat', { category: 'Tools' }]]);
    await enter('sword');
    await wait();
    await render(<VendingPanel data={{ ...data, current_category: 'Tools', search_revision: 1 }} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await render(<VendingPanel data={{ ...data, current_category: 'Tools', search: 'sword', search_mode: true, search_revision: 2 }} act={dispatch} />);
    expect(searchInput().value).toBe('sword');
    await wait();
    expect(dispatch.mock.calls).toEqual([
      ['changecat', { category: 'Tools' }],
      ['set_search', { search: 'sword' }],
    ]);
  });

  test.each(['Weapons', 'Tools'])('choosing %s cancels pending search before the category response arrives', async (category) => {
    const dispatch = mock();
    const data: VendingData = {
      motto: '', budget: 100, locked: false, is_public: true,
      is_proprietor: false, is_agent: false, can_read: true,
      tariff_rate_pct: 0, tariff_paid: 0, tariff_evaded: 0, dodging: false,
      categories: ['Tools', 'Weapons'], current_category: 'Tools', search: '',
      search_revision: 0,
      search_mode: false, result_cap: 100, total_matches: 0, packs: [],
      is_command_center: false,
    };
    await render(<VendingPanel data={data} act={dispatch} />);
    await enter('sword');
    const categoryButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent === category,
    )!;
    await act(async () => categoryButton.click());
    await wait();
    expect(dispatch.mock.calls).toEqual([['changecat', { category }]]);
    expect(searchInput().value).toBe('');
    await render(<VendingPanel data={{ ...data, current_category: category, search_revision: 1 }} act={dispatch} />);
    await wait();
    expect(dispatch.mock.calls).toHaveLength(1);
  });
});
