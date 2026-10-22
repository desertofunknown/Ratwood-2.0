// Installed before imports. A denied attempt throws before touching any service.
const attempts: string[] = [];
const deny = (name: string) =>
  function () {
    attempts.push(name);
    throw Error(`Disconnected test attempted ${name}`);
  };
export function installTripwires(native = true) {
  for (const scope of new Set<object>([globalThis, window])) {
    for (const name of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'Worker',
      'SharedWorker',
      'Audio',
      'AudioContext',
      'webkitAudioContext',
    ]) {
      Object.defineProperty(scope, name, {
        configurable: true,
        writable: true,
        value: deny(name),
      });
    }
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(scope, name, {
        configurable: true,
        value: {
          getItem: deny(name),
          setItem: deny(name),
          removeItem: deny(name),
          clear: deny(name),
          key: deny(name),
        },
      });
    }
    Object.defineProperty(scope, 'indexedDB', {
      configurable: true,
      value: { open: deny('indexedDB'), deleteDatabase: deny('indexedDB') },
    });
    if (native)
      for (const name of ['Byond', 'hubStorage']) {
        Object.defineProperty(scope, name, {
          configurable: true,
          get: deny(name),
        });
      }
  }
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: deny('media.play'),
  });
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: deny('sendBeacon'),
  });
}
export const attempted = () => [...attempts];
