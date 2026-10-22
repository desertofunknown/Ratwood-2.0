import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const isolatedSuites = [
  {
    file: 'packages/tgui/__tests__/number-input-validity.test.tsx',
    flag: 'TGUI_NUMBER_VALIDITY_TEST_CHILD',
    wrapper: 'number input validity and recovery (isolated layout shell)',
  },
  {
    file: 'packages/tgui/__tests__/blueprint-import.test.tsx',
    flag: 'TGUI_BLUEPRINT_IMPORT_TEST_CHILD',
    wrapper: 'mounted blueprint import (isolated layout shell)',
  },
  {
    file: 'packages/tgui/__tests__/list-input-shortcuts.test.tsx',
    flag: 'TGUI_LIST_SHORTCUT_TEST_CHILD',
    wrapper: 'mounted list input shortcuts (isolated layout shell and hotkeys)',
  },
] as const;

type IsolatedSuite = (typeof isolatedSuites)[number];

const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bun 1.2.16 prefixes root-level test names with a space when matching -t.
// Match only these exact wrappers, not similarly named or nested tests.
export const ordinaryPattern = `^(?! ?(?:${isolatedSuites
  .map(({ wrapper }) => escapePattern(wrapper))
  .join('|')})$)`;

const attribute = (tag: string, name: string) => {
  const value = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
  if (value === undefined) throw new Error(`Missing JUnit ${name} attribute`);
  return value;
};

// This deliberately reads only the pinned Bun reporter's summary and case tags,
// not arbitrary XML. Reject missing/truncated reports and inconsistent counts.
export function validateReport(xml: string, isolated?: IsolatedSuite) {
  const summary = xml.match(/<testsuites\b([^>]*)>/)?.[1];
  if (!summary || !xml.trimEnd().endsWith('</testsuites>')) {
    throw new Error('Missing or malformed Bun JUnit report');
  }
  const count = (name: string) => {
    const value = attribute(summary, name);
    if (!/^\d+$/.test(value)) throw new Error(`Invalid JUnit ${name} count`);
    return Number(value);
  };
  const cases = [
    ...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
  ].map(([, tag, body = '']) => ({
    name: attribute(tag, 'name'),
    file: attribute(tag, 'file'),
    skipped: /<skipped\s*\/>/.test(body),
  }));
  const skipped = cases.filter((item) => item.skipped);
  if (
    (xml.match(/<testsuites\b/g) ?? []).length !== 1 ||
    (xml.match(/<\/testsuites>/g) ?? []).length !== 1 ||
    (xml.match(/<testsuite\b/g) ?? []).length === 0 ||
    (xml.match(/<testsuite\b/g) ?? []).length !==
      (xml.match(/<\/testsuite>/g) ?? []).length ||
    (xml.match(/<testcase\b/g) ?? []).length !== cases.length ||
    (xml.match(/<\/testcase>/g) ?? []).length !==
      cases.length - (xml.match(/<testcase\b[^>]*\/>/g) ?? []).length ||
    count('tests') !== cases.length ||
    count('failures') !== 0 ||
    /<(?:failure|error)\b/.test(xml) ||
    count('skipped') !== skipped.length
  ) {
    throw new Error('Inconsistent or failing Bun JUnit report');
  }
  if (isolated) {
    if (
      cases.length === 0 ||
      skipped.length !== 0 ||
      cases.some(
        (item) =>
          item.file !== isolated.file ||
          isolatedSuites.some(({ wrapper }) => item.name === wrapper),
      )
    ) {
      throw new Error(
        `Missing isolated cases or wrapper recursion: ${isolated.file}`,
      );
    }
  } else if (
    cases.length <= isolatedSuites.length ||
    skipped.length !== isolatedSuites.length ||
    isolatedSuites.some(
      ({ file, wrapper }) =>
        cases.filter((item) => item.file === file).length !== 1 ||
        skipped.filter((item) => item.file === file && item.name === wrapper)
          .length !== 1,
    )
  ) {
    throw new Error(
      'Ordinary suite must skip exactly the three isolated wrappers',
    );
  }
  return cases.length - skipped.length;
}

type Run = (
  executable: string,
  args: string[],
  options: SpawnSyncOptions,
) => { status: number | null; signal?: string | null; error?: Error };

export function runTests(run: Run = spawnSync, report = console.error) {
  const root = resolve(import.meta.dir, '..');
  const reports = mkdtempSync(join(tmpdir(), 'tgui-test-reports-'));
  const env = { ...process.env };
  for (const { flag } of isolatedSuites) delete env[flag];
  let failed = false;
  try {
    // Do not put the child suites inside another Bun test: each child case gets
    // Bun's unchanged default 5s deadline, not one shared 5s aggregate deadline.
    for (const isolated of [undefined, ...isolatedSuites]) {
      const label = isolated?.file ?? 'ordinary suite';
      const output = join(reports, `${isolated?.flag ?? 'ordinary'}.xml`);
      const args = isolated
        ? [
            'test',
            '--tsconfig-override',
            join(root, 'tsconfig.json'),
            isolated.file,
          ]
        : ['test', '--test-name-pattern', ordinaryPattern];
      args.push('--reporter=junit', `--reporter-outfile=${output}`);
      try {
        const result = run(process.execPath, args, {
          cwd: root,
          env: isolated ? { ...env, [isolated.flag]: '1' } : { ...env },
          stdio: 'inherit',
          // Preserve the existing child watchdog. The ordinary suite has none.
          ...(isolated ? { timeout: 30000 } : {}),
        });
        if (result.error) throw result.error;
        if (result.signal) throw new Error(`Terminated by ${result.signal}`);
        if (result.status !== 0) {
          throw new Error(`Bun exited with ${result.status}`);
        }
        const cases = validateReport(readFileSync(output, 'utf8'), isolated);
        report(`${label}: ${cases} cases passed`);
      } catch (error) {
        failed = true;
        report(`${label}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    rmSync(reports, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

// Reading import.meta.main in a module imported by Bun 1.2.16 tests suppresses
// later node:test registrations. Keep this entrypoint check side-effect-free.
if (process.argv[1] === import.meta.path) {
  if (process.argv.length > 2) {
    console.error(
      'tgui:test runs the complete suite. Use bun test <file> for focused runs.',
    );
    process.exitCode = 1;
  } else {
    process.exitCode = runTests();
  }
}
