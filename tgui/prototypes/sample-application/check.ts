// Checks only; no engine, browser, network listener or generated bundle execution.
for (const command of [
  [
    process.execPath,
    '../../node_modules/typescript/bin/tsc',
    '--project',
    'tsconfig.json',
    '--pretty',
    'false',
  ],
  [process.execPath, 'test.ts'],
  [process.execPath, 'archive-test.ts'],
  [process.execPath, 'dialogs-test.ts'],
  [
    process.execPath,
    'test',
    'boundary.test.ts',
    'tests/host-lifetime.test.ts',
    'tests/host-endpoint-binding.test.ts',
    'tests/screens-session.test.ts',
    'tests/screens-mount.test.ts',
    'tests/screens-workbench-failure.test.ts',
    'tests/bundle-audit.test.ts',
    'tests/archive-styles.test.ts',
    'tests/dialog-styles.test.ts',
    'tests/dialog-controller.test.ts',
  ],
]) {
  const child = Bun.spawn(command, {
    cwd: import.meta.dir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code) process.exit(code);
}
export {};
