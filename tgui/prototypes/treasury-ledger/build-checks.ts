import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const here = import.meta.dir;
const output = join(here, 'dist');
const repository = join(here, '../../..');
const hash = (input: string | Uint8Array) =>
  createHash('sha256').update(input).digest('hex');
const manifest = JSON.parse(
  await readFile(join(output, 'manifest.json'), 'utf8'),
);

test('both builds are external-style, same-CSS, no native runtime imports, and strict CSP', async () => {
  for (const arm of ['react', 'svelte']) {
    const html = await readFile(join(output, arm, 'index.html'), 'utf8');
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(
      [...host.querySelectorAll('link[rel=stylesheet]')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      '../tokens.css',
      '../controls.css',
      '../ledger.css',
      '../preview.css',
    ]);
    expect(host.querySelectorAll('style,[style]')).toHaveLength(0);
    expect(host.querySelectorAll('script')).toHaveLength(1);
    expect(host.querySelector('script')!.textContent).toBe('');
    const csp = host
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    for (const kind of ['connect', 'font', 'img', 'worker', 'object'])
      expect(csp).toContain(`${kind}-src 'none'`);
    expect(csp).not.toContain('unsafe-inline');
    expect(host.querySelector('iframe,object,img,form')).toBeNull();
    const script = await readFile(join(output, arm, 'app.js'));
    expect(hash(script)).toBe(manifest.builds[arm].sha256);
    expect(script.byteLength).toBe(manifest.builds[arm].bytes);
    expect(
      manifest.builds[arm].inputs.every(
        (path: string) => !path.includes('/packages/tgui/'),
      ),
    ).toBe(true);
    expect(
      manifest.builds[arm].inputs.some((path: string) =>
        /(?:test-dom|test-network|view-checks|oracle-checks|index-server)\./.test(
          path,
        ),
      ),
    ).toBe(false);
    expect(
      manifest.builds[arm].inputs.some((path: string) =>
        /treasury-ledger\/(?:react|svelte)-entry/.test(path),
      ),
    ).toBe(true);
    expect(await readdir(join(output, arm))).toEqual(['app.js', 'index.html']);
  }
  for (const name of ['tokens', 'controls']) {
    expect(await readFile(join(output, `${name}.css`), 'utf8')).toBe(
      await readFile(join(here, `../ui-shared/${name}.css`), 'utf8'),
    );
  }
  for (const name of ['ledger', 'preview']) {
    expect(await readFile(join(output, `${name}.css`), 'utf8')).toBe(
      await readFile(join(here, `${name}.css`), 'utf8'),
    );
  }
});

test('every inventoried source hash and license file exists; original provenance is retained', async () => {
  for (const source of manifest.sources) {
    expect(hash(await readFile(join(repository, source.path)))).toBe(
      source.sha256,
    );
  }
  for (const name of ['react', 'react-dom', 'svelte', 'scheduler']) {
    const dependency = manifest.dependencies.find(
      (entry: any) => entry.name === name,
    );
    expect(dependency).toBeDefined();
    expect(dependency.files.length).toBeGreaterThan(0);
    for (const file of dependency.files)
      expect(
        (await readFile(join(output, file), 'utf8')).length,
      ).toBeGreaterThan(100);
  }
  expect(await readFile(join(output, 'LICENSE.txt'), 'utf8')).toBe(
    await readFile(join(repository, 'LICENSE'), 'utf8'),
  );
  expect(await readFile(join(output, 'NOTICE.txt'), 'utf8')).toContain(
    'Azure-Peak PR #7000',
  );
});
