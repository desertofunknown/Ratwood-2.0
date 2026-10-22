import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const here = import.meta.dir;
const generated = join(here, '.test-build');
await mkdir(generated, { recursive: true });
const compilerOptions = {
  target: 'ESNext',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  lib: ['ESNext', 'DOM', 'DOM.Iterable'],
  strict: true,
  skipLibCheck: true,
  allowJs: true,
  checkJs: false,
  noEmit: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  jsx: 'react-jsx',
  types: ['bun'],
};
// The isolated oracle imports the real native component, whose transitive source
// follows the existing workspace's non-strict settings rather than this boundary.
await writeFile(
  join(generated, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions,
      include: ['../*.ts', '../*.tsx', '../*.svelte'],
      exclude: ['../oracle-checks.tsx', '../dist', './'],
    },
    null,
    2,
  ),
);
await writeFile(
  join(generated, 'oracle-tsconfig.json'),
  JSON.stringify(
    {
      extends: '../../../tsconfig.json',
      compilerOptions: { jsx: 'react-jsx', types: ['bun', 'webpack-env'] },
      files: ['../oracle-checks.tsx', '../assets.d.ts', '../../../global.d.ts'],
      include: [],
    },
    null,
    2,
  ),
);
for (const command of [
  [
    process.execPath,
    join(here, '../../node_modules/typescript/bin/tsc'),
    '--project',
    join(generated, 'tsconfig.json'),
    '--pretty',
    'false',
  ],
  [
    process.execPath,
    join(
      here,
      '../crafting-workbench/svelte/node_modules/svelte-check/bin/svelte-check',
    ),
    '--workspace',
    here,
    '--tsconfig',
    join(generated, 'tsconfig.json'),
    '--fail-on-warnings',
  ],
  [
    process.execPath,
    join(here, '../../node_modules/typescript/bin/tsc'),
    '--project',
    join(generated, 'oracle-tsconfig.json'),
    '--pretty',
    'false',
  ],
]) {
  const child = Bun.spawn(command, {
    cwd: here,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code) process.exit(code);
}
