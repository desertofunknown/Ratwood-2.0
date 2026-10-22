// Test-only tripwires: these throw before any network/worker can be created.
let attempts = 0;
function deny() {
  attempts++;
  throw Error(
    'Disconnected Display & Readability test attempted network or worker access.',
  );
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

// Existing APIs are blocked as well as native hubStorage. No sample may store data.
for (const scope of new Set<object>([globalThis, window])) {
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(scope, name, {
      configurable: true,
      value: {
        getItem: deny,
        setItem: deny,
        removeItem: deny,
        clear: deny,
        key: deny,
      },
    });
  }
  Object.defineProperty(scope, 'indexedDB', {
    configurable: true,
    value: { open: deny, deleteDatabase: deny },
  });
}
