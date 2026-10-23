import { expect, test } from 'bun:test';
import { auditOwnedEndpointBundle } from '../audit-bundle';
import { endpointBanner } from '../endpoint-binding';

const safe =
  endpointBanner + '\n__sampleEndpointFacade.sendMessage("visible");';
test('emitted binding audit accepts lexical facade and harmless guard strings', () => {
  expect(
    auditOwnedEndpointBundle(safe + '\n"Byond";').unboundByondIdentifiers,
  ).toBe(0);
});
for (const expression of [
  'Byond.sendMessage("visible");',
  'globalThis.Byond;',
  'window["Byond"];',
  'globalThis["Byond"];',
]) {
  test(`emitted binding audit rejects ${expression}`, () => {
    expect(() => auditOwnedEndpointBundle(safe + expression)).toThrow();
  });
}
test('emitted binding audit rejects missing prefix or missing compiled facade use', () => {
  expect(() => auditOwnedEndpointBundle(safe.slice(1))).toThrow();
  expect(() => auditOwnedEndpointBundle(endpointBanner)).toThrow();
});
