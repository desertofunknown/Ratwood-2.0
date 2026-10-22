// Exact production credits fragment; regenerated only for parity verification.
import { readFileSync } from 'node:fs';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source = readFileSync(
  new URL('../../packages/tgui/interfaces/Changelog.jsx', import.meta.url),
  'utf8',
);
const fragment = source.split('    const credits = (')[1].split('\n    );')[0];
const path = new URL('.credits-extract.tmp.tsx', import.meta.url);
try {
  await Bun.write(
    path,
    "import React from 'react'; export default () => (" + fragment + ');',
  );
  const module = await import(path.href);
  await Bun.write(
    new URL('credits.html', import.meta.url),
    renderToStaticMarkup(React.createElement(module.default)),
  );
} finally {
  await (await import('node:fs/promises')).unlink(path);
}
