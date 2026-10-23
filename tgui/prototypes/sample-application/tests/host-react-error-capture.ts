/**
 * Test-only: React captures reportError at import time. Intercept only the exact
 * expected boundary error during an explicit synchronous test operation. Every
 * unrelated error still reaches the original reporter (or is thrown).
 */
const original = Object.getOwnPropertyDescriptor(globalThis, 'reportError');
const originalReport = globalThis.reportError;
const boundaryMessage =
  'Disconnected sample shell refuses native or unowned globals.';
let expected: unknown[] | undefined;
const report = (error: unknown) => {
  if (expected && error instanceof Error && error.message === boundaryMessage) {
    expected.push(error);
    return;
  }
  if (typeof originalReport === 'function')
    originalReport.call(globalThis, error);
  else throw error;
};
Object.defineProperty(globalThis, 'reportError', {
  configurable: true,
  writable: true,
  value: report,
});

export const reactBoundaryErrors = {
  capture(operation: () => void) {
    if (expected) throw new Error('Expected React error scopes must not nest.');
    const result: unknown[] = [];
    expected = result;
    try {
      operation();
    } finally {
      expected = undefined;
    }
    return result;
  },
  restore() {
    expected = undefined;
    if (
      Object.getOwnPropertyDescriptor(globalThis, 'reportError')?.value !==
      report
    )
      return;
    if (original) Object.defineProperty(globalThis, 'reportError', original);
    else Reflect.deleteProperty(globalThis, 'reportError');
  },
};
