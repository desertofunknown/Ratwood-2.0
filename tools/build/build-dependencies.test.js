/**
 * Engine-free dependency-planning regression tests.
 * Run: bun test tools/build/build-dependencies.test.js
 *
 * Never import build.ts: its top-level setup starts the build runner. Read only
 * the bundled Juke argument parser and narrowly validated dependency callbacks.
 * No target executes callback, compiler, server, download, or generator runs.
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import vm from "node:vm";

const build = fs.readFileSync(new URL("./build.ts", import.meta.url), "utf8");
const juke = fs.readFileSync(new URL("./juke/index.js", import.meta.url), "utf8");

function uniqueMatch(source, pattern, description) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${description}; review test extraction`);
  }
  return matches[0][1];
}

// These three pure functions are copied verbatim from the bundled implementation,
// not reimplemented. Their context has no real process, imports, or filesystem.
const parserSource = uniqueMatch(
  juke,
  /(var stringToBoolean = [\s\S]*?return parameterMap;\n};)/g,
  "Juke argument-parser section",
);
const parser = vm.createContext(
  { process: { env: {} } },
  { codeGeneration: { strings: false, wasm: false } },
);
vm.runInContext(parserSource, parser, { timeout: 1000 });

// Parameter interface expected by the real parser. This models only -D/--define;
// the tests below also verify that both actual targets accept DefineParameter.
const define = Object.freeze({
  name: "define",
  alias: "D",
  isBoolean: () => false,
  isNumber: () => false,
  isArray: () => true,
  toConstCase: () => "DEFINE",
  toCamelCase: () => "define",
  toKebabCase: () => "define",
});
const generator = Object.freeze({ name: "dm-maps-include" });

function targetBlock(name) {
  return uniqueMatch(
    build,
    new RegExp(`export const ${name} = new Juke\\.Target\\(\\{([\\s\\S]*?)^\\}\\);`, "gm"),
    `${name} definition`,
  );
}

function dependencyPredicate(name) {
  // Match only this pure callback shape. Changes to the shape must be reviewed,
  // rather than evaluating an arbitrary target block or an executes callback.
  const source = uniqueMatch(
    targetBlock(name),
    /dependsOn: (\(\{ get \}\) => \[\s*get\(DefineParameter\)\.includes\("[A-Z_]+"\) && DmMapsIncludeTarget,\s*\]),/g,
    `${name} dependency predicate`,
  );
  return vm.runInNewContext(
    `(${source})`,
    { DefineParameter: define, DmMapsIncludeTarget: generator },
    { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
  );
}

const predicates = {
  dm: dependencyPredicate("DmTarget"),
  "dm-test": dependencyPredicate("DmTestTarget"),
};

function plan(args) {
  const { globalFlags, taskArgs } = parser.prepareArgs([...args]);
  expect(taskArgs.length).toBe(1);
  const [name, ...localArgs] = taskArgs[0];
  const globalValues = parser.parseArgs(globalFlags, [define]);
  const localValues = parser.parseArgs(localArgs, [define]);
  // Juke runner.start resolves local parameters before globals and defaults
  // string[] parameters to []; nothing from the worker/execution phase is used.
  const values = localValues.get(define) ?? globalValues.get(define) ?? [];
  const dependencies = predicates[name]({ get: () => values }).filter(Boolean);
  return { values: [...values], dependencies: [...dependencies] };
}

for (const [cliName, exportName] of Object.entries({
  dm: "DmTarget",
  "dm-test": "DmTestTarget",
})) {
  describe(cliName, () => {
    test("accepts and forwards caller defines", () => {
      const block = targetBlock(exportName);
      expect(block).toMatch(/parameters: \[\s*DefineParameter,/);
      expect(block).toMatch(/defines: \[[^\n]*\.\.\.get\(DefineParameter\)\]/);
    });

    for (const defines of [
      [],
      ["ALL_MAPS"],
      ["ALL_TEMPLATES"],
      ["ALL_MAPS", "ALL_TEMPLATES"],
    ]) {
      for (const position of ["before", "after"]) {
        test(`${defines.join(" + ") || "default"}, flags ${position} target`, () => {
          const flags = defines.map((value) => `-D${value}`);
          const args = position === "before"
            ? [...flags, cliName]
            : [cliName, ...flags];
          const result = plan(args);
          expect(result.values).toEqual(defines);
          expect(result.dependencies).toEqual(
            defines.includes("ALL_TEMPLATES") ? [generator] : [],
          );
        });
      }
    }
  });
}

test("local defines override global defines, matching Juke runner semantics", () => {
  for (const cliName of Object.keys(predicates)) {
    const result = plan(["-DALL_MAPS", cliName, "-DALL_TEMPLATES"]);
    expect(result.values).toEqual(["ALL_TEMPLATES"]);
    expect(result.dependencies).toEqual([generator]);
  }
});

test("the base map includes the generated file under ALL_TEMPLATES", () => {
  const baseMap = fs.readFileSync(new URL("../../_maps/_basemap.dm", import.meta.url), "utf8");
  expect(baseMap).toMatch(/#ifdef ALL_TEMPLATES\s+#include "templates\.dm"\s+#endif/);
  expect([...baseMap.matchAll(/#include "templates\.dm"/g)]).toHaveLength(1);
});
