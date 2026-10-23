import assert from 'node:assert/strict';
import ts from 'typescript';

import { endpointBanner } from './endpoint-binding';

/** Verify the fixture binding survived compilation, not just build configuration. */
export function auditOwnedEndpointBundle(code: string) {
  assert(
    code.startsWith(endpointBanner),
    'Owned endpoint banner must execute first.',
  );
  const source = ts.createSourceFile(
    'sample.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let facadeReferences = 0;
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      assert(
        node.text !== 'Byond',
        'Unbound native endpoint identifier in emitted sample.',
      );
      if (node.text === '__sampleEndpointFacade') facadeReferences++;
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['window', 'globalThis'].includes(node.expression.text) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      assert(
        node.argumentExpression.text !== 'Byond',
        'Direct native global lookup in emitted sample.',
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert(
    facadeReferences > 1,
    'Compiled host must reference its owned endpoint facade.',
  );
  return { facadeReferences, unboundByondIdentifiers: 0 };
}
