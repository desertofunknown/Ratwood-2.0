const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const tsPlugin = require('@typescript-eslint/eslint-plugin');
const { ESLint } = require('eslint');
const unusedImports = require('eslint-plugin-unused-imports');

const cwd = path.resolve(__dirname, '..');
const options = {
  filePath: path.join(cwd, 'packages/tgui/interfaces/lint-regression.tsx'),
};
const eslint = new ESLint({ cwd, fix: false });
const fixer = new ESLint({ cwd, fix: true });
const ruleId = 'unused-imports/no-unused-imports';

const cases = [
  {
    name: 'quoted enum members do not crash the unused-import rule',
    code: "export enum Priority { null = 'red', 'low' = 'orange', 'high' = 'red' }\n",
    unused: 0,
  },
  {
    name: 'unused named imports are reported and removed',
    code: "import { discarded, useThing } from 'module';\nexport const value = useThing();\n",
    unused: 1,
    removed: ['discarded'],
    retained: ["import { useThing } from 'module';"],
  },
  {
    name: 'used type-only imports survive the fixer',
    code: "import type { UnusedType, UsedType } from 'module';\nexport type Result = UsedType;\n",
    unused: 1,
    removed: ['UnusedType'],
    retained: ["import type { UsedType } from 'module';"],
  },
  {
    name: 'JSX and side-effect imports survive the fixer',
    code: "import 'setup';\n\nimport { Component, Unused } from 'widgets';\n\nexport const view = <Component />;\n",
    unused: 1,
    removed: ['Unused'],
    retained: ["import 'setup';", "import { Component } from 'widgets';"],
  },
  {
    name: 'unused default imports are removed without removing used defaults',
    code: "import UnusedDefault from 'unused';\nimport Kept from 'used';\n\nexport const view = <Kept />;\n",
    unused: 1,
    removed: ['UnusedDefault', "from 'unused'"],
    retained: ["import Kept from 'used';"],
  },
  {
    name: 'namespace imports used by types survive the fixer',
    code: "import * as Used from 'used';\nimport * as Unused from 'unused';\n\nexport type Value = Used.Value;\n",
    unused: 1,
    removed: ['Unused', "from 'unused'"],
    retained: ["import * as Used from 'used';", 'Used.Value'],
  },
  {
    name: 'unused local variables are outside the import-only rule',
    code: 'const notAnImport = 1;\nexport const used = 2;\n',
    unused: 0,
    retained: ['const notAnImport = 1;'],
  },
];

for (const fixture of cases) {
  test(fixture.name, async () => {
    // The plugin must use the TypeScript rule, not its JavaScript fallback.
    assert.equal(
      unusedImports.rules['no-unused-imports'].meta.messages,
      tsPlugin.rules['no-unused-vars'].meta.messages,
    );

    const [result] = await eslint.lintText(fixture.code, options);
    const imports = result.messages.filter(
      (message) => message.ruleId === ruleId,
    );
    assert.equal(result.fatalErrorCount, 0);
    assert.equal(imports.length, fixture.unused);
    for (const message of imports) {
      assert.equal(message.severity, 2);
      assert.ok(message.fix);
    }

    const [fixed] = await fixer.lintText(fixture.code, options);
    const output = fixed.output ?? fixture.code;
    assert.equal(fixed.fatalErrorCount, 0);
    assert.equal(
      fixed.messages.filter((message) => message.ruleId === ruleId).length,
      0,
    );
    for (const text of fixture.removed ?? []) {
      assert.ok(!output.includes(text), `Unexpected retained import: ${text}`);
    }
    for (const text of fixture.retained ?? []) {
      assert.ok(output.includes(text), `Missing retained code: ${text}`);
    }
  });
}
