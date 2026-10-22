import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  isolatedSuites,
  ordinaryPattern,
  runTests,
  validateReport,
} from './run-tests';

const caseXml = (name: string, file: string, skipped = false) =>
  `<testcase name="${name}" classname="" file="${file}">${skipped ? '<skipped />' : ''}</testcase>`;
const reportXml = (cases: string[], skipped = 0) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${cases.length}" failures="0" skipped="${skipped}">
  <testsuite>${cases.join('\n')}</testsuite>
</testsuites>`;
const ordinaryCases = [
  caseXml('ordinary case', 'ordinary.test.ts'),
  ...isolatedSuites.map(({ file, wrapper }) => caseXml(wrapper, file, true)),
];
const ordinaryReport = reportXml(ordinaryCases, 3);
const isolatedReport = (
  suite: (typeof isolatedSuites)[number] = isolatedSuites[0],
) => reportXml([caseXml('real child case', suite.file)]);

test('ordinary filter excludes only exact wrappers, including Bun root-name spaces', () => {
  const pattern = new RegExp(ordinaryPattern);
  for (const { wrapper } of isolatedSuites) {
    expect(pattern.test(wrapper)).toBe(false);
    expect(pattern.test(` ${wrapper}`)).toBe(false);
    expect(pattern.test(`${wrapper} extra`)).toBe(true);
    expect(pattern.test(`parent ${wrapper}`)).toBe(true);
    expect(pattern.test(wrapper.replace('(', '['))).toBe(true);
  }
  expect(pattern.test('ordinary case')).toBe(true);
});

test('ordinary report counts real cases, not the three skipped wrappers', () => {
  expect(validateReport(ordinaryReport)).toBe(1);
});

test('isolated report accepts real child cases including self-closing tags', () => {
  const suite = isolatedSuites[0];
  const xml = reportXml([
    caseXml('child one', suite.file),
    `<testcase name="child two" file="${suite.file}" />`,
  ]);
  expect(validateReport(xml, suite)).toBe(2);
});

test('ordinary report rejects missing or renamed wrapper skips', () => {
  expect(() =>
    validateReport(reportXml(ordinaryCases.slice(0, -1), 2)),
  ).toThrow();
  expect(() =>
    validateReport(
      ordinaryReport.replace(isolatedSuites[0].wrapper, 'renamed wrapper'),
    ),
  ).toThrow();
});

test('ordinary report rejects duplicate wrappers and unintended skipped cases', () => {
  expect(() =>
    validateReport(reportXml([...ordinaryCases, ordinaryCases[1]], 4)),
  ).toThrow();
  expect(() =>
    validateReport(
      reportXml(
        [...ordinaryCases, caseXml('lost case', 'other.test.ts', true)],
        4,
      ),
    ),
  ).toThrow();
});

for (const [name, malformed] of [
  ['empty', ''],
  ['truncated', '<testsuites tests="0" failures="0" skipped="0">'],
  ['invalid count', ordinaryReport.replace('tests="4"', 'tests="oops"')],
  ['wrong case count', ordinaryReport.replace('tests="4"', 'tests="5"')],
  ['wrong skip count', ordinaryReport.replace('skipped="3"', 'skipped="2"')],
  ['reported failures', ordinaryReport.replace('failures="0"', 'failures="1"')],
  ['missing file', ordinaryReport.replace(' file="ordinary.test.ts"', '')],
  ['unclosed case', ordinaryReport.replace('</testcase>', '')],
  ['unclosed suite', ordinaryReport.replace('</testsuite>', '')],
  ['missing suite', ordinaryReport.replace(/<\/?testsuite>/g, '')],
  ['extra root closer', `${ordinaryReport}</testsuites>`],
  [
    'extra case closer',
    ordinaryReport.replace('</testcase>', '</testcase></testcase>'),
  ],
  [
    'failure element',
    ordinaryReport.replace(
      '</testcase>',
      '<failure type="AssertionError" /></testcase>',
    ),
  ],
]) {
  test(`rejects malformed or failing report: ${name}`, () => {
    expect(() => validateReport(malformed)).toThrow();
  });
}

test('isolated report rejects zero cases, skips, wrapper recursion and wrong files', () => {
  const suite = isolatedSuites[0];
  for (const xml of [
    reportXml([]),
    reportXml([caseXml('child', suite.file, true)], 1),
    reportXml([caseXml(suite.wrapper, suite.file)]),
    reportXml([caseXml('child', 'wrong.test.ts')]),
  ]) {
    expect(() => validateReport(xml, suite)).toThrow();
  }
});

type Run = NonNullable<Parameters<typeof runTests>[0]>;
const successfulRun: Run = (_executable, args, options) => {
  const suite = isolatedSuites.find(({ flag }) => options.env?.[flag] === '1');
  const output = args.find((arg) => arg.startsWith('--reporter-outfile='))!;
  writeFileSync(
    output.slice('--reporter-outfile='.length),
    suite ? isolatedReport(suite) : ordinaryReport,
  );
  return { status: 0 };
};

test('serial runner clears inherited child flags and preserves deadlines and output', () => {
  const previous = isolatedSuites.map(({ flag }) => process.env[flag]);
  let calls = 0;
  try {
    for (const { flag } of isolatedSuites) process.env[flag] = 'inherited';
    expect(
      runTests(
        (executable, args, options) => {
          const suite = calls === 0 ? undefined : isolatedSuites[calls - 1];
          if (suite) expect(options.timeout).toBe(30000);
          else expect(options.timeout).toBeUndefined();
          expect(options.stdio).toBe('inherit');
          expect(args.some((arg) => arg.startsWith('--timeout'))).toBe(false);
          for (const { flag } of isolatedSuites) {
            if (flag === suite?.flag) expect(options.env?.[flag]).toBe('1');
            else expect(options.env?.[flag]).toBeUndefined();
          }
          if (suite) expect(args).toContain(suite.file);
          else expect(args).toContain(ordinaryPattern);
          calls++;
          return successfulRun(executable, args, options);
        },
        () => {},
      ),
    ).toBe(0);
    expect(calls).toBe(4);
  } finally {
    isolatedSuites.forEach(({ flag }, index) => {
      if (previous[index] === undefined) delete process.env[flag];
      else process.env[flag] = previous[index];
    });
  }
});

for (const result of [
  { status: 1 },
  { status: null },
  { status: null, signal: 'SIGTERM' },
  { status: null, error: new Error('spawn failed') },
]) {
  test(`runner propagates ${JSON.stringify(result)} and still runs remaining suites`, () => {
    let calls = 0;
    expect(
      runTests(
        (...args) => {
          calls++;
          return calls === 2 ? result : successfulRun(...args);
        },
        () => {},
      ),
    ).toBe(1);
    expect(calls).toBe(4);
  });
}

test('runner fails closed on a missing report and still runs remaining suites', () => {
  let calls = 0;
  expect(
    runTests(
      (...args) => {
        calls++;
        return calls === 1 ? { status: 0 } : successfulRun(...args);
      },
      () => {},
    ),
  ).toBe(1);
  expect(calls).toBe(4);
});

test('importing the runner preserves later node:test registrations', () => {
  const fixtures = mkdtempSync(join(tmpdir(), 'tgui-runner-import-'));
  try {
    const first = join(fixtures, 'first.test.ts');
    const second = join(fixtures, 'second.test.mjs');
    writeFileSync(
      first,
      `
      import ${JSON.stringify(join(import.meta.dir, 'run-tests.ts'))};
      import { test } from 'bun:test';
      test('Bun fixture stays registered', () => {});
    `,
    );
    writeFileSync(
      second,
      `
      import test from 'node:test';
      test('node:test fixture stays registered', () => {});
    `,
    );
    const result = spawnSync(process.execPath, ['test', first, second], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.error) throw result.error;
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('(pass) Bun fixture stays registered');
    expect(result.stderr).toContain(
      '(pass) node:test fixture stays registered',
    );
  } finally {
    rmSync(fixtures, { recursive: true, force: true });
  }
});
