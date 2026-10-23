// Test-only tripwires are installed before importing any application module.
// They do not try a real connection or relax any execution isolation boundary.
let attempted = 0;
const restores: (() => void)[] = [];
const deny = () => {
  attempted++;
  throw new Error('Network APIs are forbidden in mounted fixture tests.');
};
for (const name of [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
]) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: deny,
  });
  restores.push(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}
const originalBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: deny,
});
restores.push(() => {
  if (originalBeacon) {
    Object.defineProperty(navigator, 'sendBeacon', originalBeacon);
  } else Reflect.deleteProperty(navigator, 'sendBeacon');
});
export const networkGuard = {
  get attempted() {
    return attempted;
  },
  restore() {
    restores.forEach((restore) => restore());
  },
};
