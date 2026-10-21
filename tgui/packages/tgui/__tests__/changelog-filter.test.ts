import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';

import { filterChangelog } from '../interfaces/Changelog/filter';

type Archive = Record<string, Record<string, Record<string, string>[]>>;

const fixture: Archive = {
  '2026-10-01': {
    Zebra: [{ bugfix: 'Fixed iron gates' }, { rscadd: 'Added BLUE lamps' }],
    Alice: [{ map: 'Moved the harbor' }],
  },
  '2026-10-03': {
    Beta: [
      { sound: 'Quiet gates' },
      { unknown_category: 'Unusual change' },
      {
        tweak: 'Visible first description',
        hidden: 'Secret second description',
      },
    ],
    Zebra: [{ qol: 'Faster sorting' }],
  },
};

// Deliberately simple oracle: collect visible rows, then rebuild only matches.
function reference(archive: Archive, query: string) {
  const needle = query.trim().toLowerCase();
  const rows = Object.entries(archive).flatMap(([day, authors]) =>
    Object.entries(authors).flatMap(([author, entries]) =>
      entries.map((entry) => ({ day, author, entry })),
    ),
  );
  const matching = rows.filter(({ author, entry }) => {
    const category = Object.keys(entry)[0] ?? '';
    return [author, category, entry[category] ?? ''].some((text) =>
      text.toLowerCase().includes(needle),
    );
  });
  const filtered: Archive = {};
  for (const { day, author, entry } of matching) {
    filtered[day] ??= {};
    filtered[day][author] ??= [];
    filtered[day][author].push(entry);
  }
  return {
    archive: needle ? filtered : archive,
    totalEntries: rows.length,
    matchingEntries: matching.length,
  };
}

describe('current-month changelog filtering', () => {
  for (const query of ['', ' ', '\t\n']) {
    test(`blank ${JSON.stringify(query)} preserves archive identity and ordering`, () => {
      const result = filterChangelog(fixture, query);
      expect(result.archive).toBe(fixture);
      expect(result.totalEntries).toBe(7);
      expect(result.matchingEntries).toBe(7);
      expect(Object.keys(result.archive)).toEqual(['2026-10-01', '2026-10-03']);
      expect(Object.keys(result.archive['2026-10-01'])).toEqual([
        'Zebra',
        'Alice',
      ]);
    });
  }

  for (const query of [
    'zEbRa',
    ' ALICE ',
    'bugfix',
    'RSCADD',
    'unknown_category',
    'blue',
    'gates',
    'quiet gates',
    'visible first',
    'hidden',
    'secret second',
    '2026-10',
    'no such entry',
    'gates blue',
    'author:Zebra',
    '.*',
  ]) {
    test(`${JSON.stringify(query)} matches the straightforward visible-field reference`, () => {
      expect(filterChangelog(fixture, query)).toEqual(
        reference(fixture, query),
      );
    });
  }

  test('filtered groups retain insertion order and original entry objects without mutation', () => {
    const before = JSON.stringify(fixture);
    const result = filterChangelog(fixture, 'a');
    expect(result).toEqual(reference(fixture, 'a'));
    expect(Object.keys(result.archive)).toEqual(Object.keys(fixture));
    for (const [day, authors] of Object.entries(result.archive)) {
      expect(Object.keys(authors)).toEqual(Object.keys(fixture[day]));
      for (const [author, entries] of Object.entries(authors)) {
        for (const entry of entries) {
          expect(
            fixture[day][author].some((original) => original === entry),
          ).toBe(true);
        }
      }
    }
    expect(JSON.stringify(fixture)).toBe(before);
  });

  test('unmatched authors and days are removed, not left as empty headings', () => {
    expect(filterChangelog(fixture, 'harbor')).toEqual({
      archive: { '2026-10-01': { Alice: [fixture['2026-10-01'].Alice[0]] } },
      totalEntries: 7,
      matchingEntries: 1,
    });
    expect(filterChangelog(fixture, 'not found').archive).toEqual({});
  });

  test('empty archives and empty groups have accurate counts', () => {
    const emptyArchives: Archive[] = [
      {},
      { '2026-10-01': {} },
      { '2026-10-01': { Nobody: [] } },
    ];
    for (const archive of emptyArchives) {
      for (const query of ['', ' ', 'missing']) {
        expect(filterChangelog(archive, query)).toEqual(
          reference(archive, query),
        );
        if (!query.trim()) {
          expect(filterChangelog(archive, query).archive).toBe(archive);
        }
      }
    }
  });

  test('mixed generated archives agree with the reference for every field and substring', () => {
    const archive: Archive = {};
    for (let day = 1; day <= 12; day++) {
      const authors: Archive[string] = {};
      for (let author = 0; author < 4; author++) {
        authors[`Writer ${author}`] = Array.from({ length: 5 }, (_, index) => ({
          [['bugfix', 'map', 'qol'][index % 3]]:
            `Day ${day} entry ${index}: ${index % 2 ? 'harbor' : 'FOREST'}`,
        }));
      }
      archive[`2026-10-${String(day).padStart(2, '0')}`] = authors;
    }
    for (const query of [
      '',
      ' writer 2 ',
      'BUG',
      'qol',
      'day 12 ',
      'FOREST',
      'entry 3',
      'harbor',
      'not present',
    ]) {
      expect(filterChangelog(archive, query)).toEqual(
        reference(archive, query),
      );
    }
  });

  test('special author keys survive filtering without prototype mutation', () => {
    const archive = JSON.parse(
      '{"2026-10-01":{"__proto__":[{"bugfix":"Gate repair"}],"constructor":[{"map":"Gate moved"}],"toString":[{"qol":"Gate polish"}]}}',
    ) as Archive;
    const result = filterChangelog(archive, 'gate');
    expect(Object.keys(result.archive['2026-10-01'])).toEqual([
      '__proto__',
      'constructor',
      'toString',
    ]);
    expect(result.archive['2026-10-01']['__proto__']).toEqual([
      { bugfix: 'Gate repair' },
    ]);
    expect(result.matchingEntries).toBe(3);
    expect(result.totalEntries).toBe(3);
    expect(
      Object.prototype.hasOwnProperty.call(
        result.archive['2026-10-01'],
        '__proto__',
      ),
    ).toBe(true);
  });

  test('empty entries match an author but never stringify absent display fields', () => {
    const archive: Archive = { '2026-10-01': { Alice: [{}] } };
    for (const query of ['', 'alice', 'undefined', 'null', 'bugfix']) {
      expect(filterChangelog(archive, query)).toEqual(
        reference(archive, query),
      );
    }
  });

  test('checked-in monthly archives preserve blank identity and agree with reference searches', () => {
    const directory = resolve(
      import.meta.dir,
      '../../../../html/changelogs/archive',
    );
    const files = readdirSync(directory).filter((name) =>
      /^\d{4}-\d{2}\.yml$/.test(name),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const archive = yaml.load(
        readFileSync(resolve(directory, file), 'utf8'),
        { schema: yaml.CORE_SCHEMA },
      ) as Archive;
      const before = JSON.stringify(archive);
      for (const query of [
        '',
        ' ',
        'bugfix',
        'MAP',
        'fix',
        '  add  ',
        'unlikely unmatched phrase 935902',
      ]) {
        expect(filterChangelog(archive, query)).toEqual(
          reference(archive, query),
        );
        if (!query.trim()) {
          expect(filterChangelog(archive, query).archive).toBe(archive);
        }
      }
      expect(JSON.stringify(archive)).toBe(before);
    }
  });
});
