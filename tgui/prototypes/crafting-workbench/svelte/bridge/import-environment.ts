// Backend drag reads Byond.windowId at module evaluation. This import runs before
// production modules, and checks.tsx immediately restores the previous descriptor.
export const originalByond = Object.getOwnPropertyDescriptor(
  globalThis,
  'Byond',
);
Reflect.set(globalThis, 'Byond', { windowId: 'disconnected-workbench' });

export const originalContext = Object.getOwnPropertyDescriptor(
  globalThis,
  '__disconnectedWebpackContext',
);
Reflect.set(globalThis, '__disconnectedWebpackContext', () => {
  const excluded = () => {
    throw new Error('Development stories are outside this fixture');
  };
  return Object.assign(excluded, { keys: excluded });
});
