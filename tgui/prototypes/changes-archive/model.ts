import dateformat from 'dateformat';
import yaml from 'js-yaml';

import {
  type ChangelogArchive,
  isChangelogArchive,
} from '../../packages/tgui/interfaces/Changelog/archive';
import { filterChangelog } from '../../packages/tgui/interfaces/Changelog/filter';

export type State = {
  data: string | ChangelogArchive;
  selectedIndex: number;
  query: string;
};
export type Dependencies = {
  dates: string[];
  action: (name: 'get_month', payload: { date: string }) => void;
  resolveAsset: (name: string) => string;
  fetch: (url: string) => Promise<{ text(): Promise<string> }>;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
};
export const loading = 'Loading changelog data...';
export function createController(deps: Dependencies) {
  const dates = [...deps.dates];
  const labels = dates.map((date) => dateformat(date, 'mmmm yyyy', true));
  let state: State = { data: loading, selectedIndex: 0, query: '' };
  let mounted = false,
    generation = 0,
    timer: unknown;
  const subscribers = new Set<() => void>();
  const schedule = deps.schedule ?? ((fn, delay) => setTimeout(fn, delay));
  const cancel =
    deps.cancel ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const update = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    subscribers.forEach((fn) => fn());
  };
  function invalidate() {
    generation++;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function request(date: string) {
    invalidate();
    const id = generation,
      action = deps.action;
    const current = () => mounted && generation === id;
    async function attempt(number = 1) {
      if (!current()) return;
      if (number > 6) {
        update({ data: 'Failed to load data after 6 attempts' });
        return;
      }
      action('get_month', { date });
      try {
        const response = await deps.fetch(deps.resolveAsset(`${date}.yml`));
        if (!current()) return;
        const text = await response.text();
        if (!current()) return;
        if (!/^Cannot find/.test(text)) {
          const archive = yaml.load(text, { schema: yaml.CORE_SCHEMA });
          if (!isChangelogArchive(archive)) {
            throw Error('Invalid changelog archive');
          }
          update({ data: archive });
          return;
        }
      } catch {
        if (!current()) return;
      }
      update({ data: `Loading changelog data${'.'.repeat(number + 3)}` });
      timer = schedule(
        () => {
          if (!current()) return;
          timer = undefined;
          void attempt(number + 1);
        },
        50 + number * 50,
      );
    }
    void attempt();
  }
  return {
    dates,
    labels,
    snapshot: () => state,
    subscribe(fn: () => void) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    mount() {
      mounted = true;
      if (dates.length) request(dates[state.selectedIndex]);
      else update({ data: 'No changelog archives are available.' });
    },
    unmount() {
      mounted = false;
      invalidate();
    },
    select(index: number) {
      if (!mounted || index < 0 || index >= dates.length) return;
      update({ selectedIndex: index, data: loading });
      request(dates[index]);
    },
    query(query: string) {
      update({ query });
    },
  };
}
export type Controller = ReturnType<typeof createController>;
export function project(state: State) {
  if (typeof state.data === 'string') {
    return { status: state.data, summary: null, days: [] };
  }
  const filtered = filterChangelog(state.data, state.query);
  return {
    status: null,
    summary: `${filtered.matchingEntries} of ${filtered.totalEntries} changes${state.query.trim() && filtered.matchingEntries === 0 ? '. No changes match this search.' : ''}`,
    days: Object.entries(filtered.archive)
      .reverse()
      .map(([date, authors]) => ({
        date,
        label: dateformat(date, 'd mmmm yyyy', true),
        authors: Object.entries(authors).map(([name, changes]) => ({
          name,
          rows: changes.map((change, index) => {
            const category = Object.keys(change)[0] ?? '';
            const value = change[category];
            return {
              index,
              category,
              text:
                typeof value === 'string' || typeof value === 'number'
                  ? String(value)
                  : '',
            };
          }),
        })),
      })),
  };
}
