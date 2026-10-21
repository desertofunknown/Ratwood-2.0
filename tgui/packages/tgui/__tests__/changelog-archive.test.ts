import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';

import { isChangelogArchive } from '../interfaces/Changelog/archive';

describe('changelog archive renderability', () => {
  test.each([null, undefined, false, 3, 'archive', []].map((value) => [value]))(
    'rejects non-record root: case %#',
    (value) => expect(isChangelogArchive(value)).toBe(false),
  );
  test.each([null, [], 'author', 3].map((value) => [value]))(
    'rejects invalid authors: case %#',
    (authors) => {
      expect(isChangelogArchive({ '2026-10-01': authors })).toBe(false);
    },
  );
  test.each([null, {}, 'change', 3].map((value) => [value]))(
    'rejects non-list entries: case %#',
    (changes) => {
      expect(isChangelogArchive({ '2026-10-01': { Alice: changes } })).toBe(
        false,
      );
    },
  );
  test.each([null, [], 'change', 3].map((value) => [value]))(
    'rejects invalid rows: case %#',
    (row) => {
      expect(isChangelogArchive({ '2026-10-01': { Alice: [row] } })).toBe(
        false,
      );
    },
  );
  test.each([{}, [], ['text'], { nested: 'text' }].map((value) => [value]))(
    'rejects structured first descriptions: case %#',
    (description) => {
      expect(
        isChangelogArchive({
          '2026-10-01': { Alice: [{ bugfix: description }] },
        }),
      ).toBe(false);
    },
  );
  test('rejects dates the existing formatter cannot render', () => {
    expect(
      isChangelogArchive({ 'not-a-date': { Alice: [{ bugfix: 'text' }] } }),
    ).toBe(false);
  });
  test('preserves empty groups, scalar descriptions, unknown categories and hidden extra fields', () => {
    const rows = [
      {},
      ...['text', 0, 1.5, true, false, null, undefined].map((value) => ({
        unknown_category: value,
      })),
      { bugfix: 'visible', hidden: { nested: ['ignored'] } },
    ];
    const archive = {
      '2026-10-01': { Alice: rows, Empty: [] },
      '2026-10-02': {},
    };
    const before = JSON.stringify(archive);
    expect(isChangelogArchive(archive)).toBe(true);
    expect(archive['2026-10-01'].Alice).toBe(rows);
    expect(JSON.stringify(archive)).toBe(before);
    expect(isChangelogArchive({})).toBe(true);
  });
  test('does not blacklist author or category names', () => {
    expect(
      isChangelogArchive(
        JSON.parse(
          '{"2026-10-01":{"__proto__":[{"constructor":"text"}],"toString":[{}]}}',
        ),
      ),
    ).toBe(true);
  });
  test('accepts every checked-in monthly archive without mutation', () => {
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
      );
      const before = JSON.stringify(archive);
      expect(isChangelogArchive(archive)).toBe(true);
      expect(JSON.stringify(archive)).toBe(before);
    }
  });
});
