const { compile } = require('svelte/compiler');

/** Build-only loader. This never imports or evaluates the generated component. */
module.exports = function compileComponent(source) {
  const result = compile(source, {
    filename: this.resourcePath,
    generate: 'client',
    dev: false,
    css: 'external',
    runes: true,
  });
  if (result.warnings.length) {
    throw new Error(
      result.warnings
        .map((warning) => `${warning.code}: ${warning.message}`)
        .join('\n'),
    );
  }
  if (result.css?.code) {
    throw new Error('Styles must remain in the exact shared external CSS.');
  }
  return result.js.code;
};
