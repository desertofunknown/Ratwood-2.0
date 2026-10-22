// Mounted test-only tripwires. No real network attempt is made.
let attempts = 0;
const deny = () => {
  attempts++;
  throw Error('Disconnected Changes test attempted network access.');
};
for (const name of [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: deny,
  });
}
Object.defineProperty(navigator, 'sendBeacon', {
  configurable: true,
  value: deny,
});
export const networkAttempts = () => attempts;
