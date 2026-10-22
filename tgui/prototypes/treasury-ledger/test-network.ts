// Test-only tripwires: these throw before any network/worker can be created.
let attempts = 0;
function deny() {
  attempts++;
  throw Error('Disconnected Treasury test attempted network or worker access.');
}
export const blockedAPIs = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
] as const;
for (const scope of new Set<object>([globalThis, window])) {
  for (const name of blockedAPIs) {
    Object.defineProperty(scope, name, {
      configurable: true,
      writable: true,
      value: deny,
    });
  }
}
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: deny,
});
export const networkAttempts = () => attempts;
