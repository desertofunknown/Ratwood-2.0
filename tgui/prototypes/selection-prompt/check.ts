import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const here = import.meta.dir;
const generated = join(here, '.test-build');
await mkdir(generated, { recursive: true });
await writeFile(
  join(generated, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
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
      },
      include: ['../*.ts', '../*.tsx', '../*.svelte'],
      exclude: ['../tests', '../dist', './'],
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
]) {
  const child = Bun.spawn(command, {
    cwd: here,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code) process.exit(code);
}
