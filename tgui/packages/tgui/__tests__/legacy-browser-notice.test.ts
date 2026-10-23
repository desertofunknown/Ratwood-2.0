import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

import { parse } from 'acorn';
import { describe, expect, test } from 'bun:test';
import { type HTMLElement, Window } from 'happy-dom';

const template = readFileSync(
  resolve(import.meta.dir, '../../../public/tgui.html'),
  'utf8',
);
const helpers = readFileSync(
  resolve(import.meta.dir, '../../tgui-setup/helpers.js'),
  'utf8',
);
const servedHelpers = readFileSync(
  resolve(import.meta.dir, '../../../public/helpers.min.js'),
  'utf8',
);
const servedErrorStyles = readFileSync(
  resolve(import.meta.dir, '../../../public/ntos-error.min.css'),
  'utf8',
);
const assetsMarker = '<!-- tgui:assets -->\n';
const noticeId = 'tgui:legacy-browser';
const chrome = 'Mozilla/5.0 Chrome/123.0.0.0 Safari/537.36';
const ie = 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko';

type FixtureOptions = {
  documentMode?: number;
  userAgent?: string;
  hostname?: string;
  search?: string;
  cef?: boolean;
};

// Mount the actual served template, using the server's exact asset marker.
// Run scripts individually in source order: Happy DOM is not an IE parser and
// does not emulate DreamSeeker. Native navigation is recorded, never performed.
function mount(options: FixtureOptions, helperSource: string) {
  const browser = new Window({
    settings: { disableJavaScriptEvaluation: true },
  });
  const document = browser.document;
  document.write(
    template
      .replace('[tgui:windowId]', 'legacy-notice-test')
      .replace('[tgui:strictMode]', '0')
      .replace('<!-- tgui:helpers -->', `<script>${helperSource}</script>`)
      .replace(
        '<!-- tgui:ntos-error -->',
        `<style>${servedErrorStyles}</style>`,
      )
      .replace(assetsMarker, '<script>observeAssets();</script>\n'),
  );
  if (options.documentMode !== undefined) {
    Object.defineProperty(document, 'documentMode', {
      value: options.documentMode,
    });
  }
  const notice = document.getElementById(noticeId) as HTMLElement;
  const bridgeCalls: string[] = [];
  const location = {
    hostname: options.hostname ?? '127.0.0.1',
    search: options.search ?? '',
    get href() {
      return '';
    },
    set href(url: string) {
      bridgeCalls.push(url);
    },
  };
  const observations: { display: string; calls: string[] }[] = [];
  const sandbox = {
    document,
    navigator: { userAgent: options.userAgent ?? chrome },
    location,
    cef_to_byond: options.cef
      ? (url: string) => bridgeCalls.push(url)
      : undefined,
    observeAssets: () => {
      observations.push({
        display: notice.style.display,
        calls: [...bridgeCalls],
      });
    },
  };
  const context = createContext({ ...sandbox });
  context.window = context;
  const scripts = Array.from(document.querySelectorAll('script'));
  const execute = (index: number) =>
    runInContext(scripts[index].textContent!, context);
  return {
    browser,
    document,
    notice,
    bridgeCalls,
    observations,
    context,
    scripts,
    execute,
  };
}

describe.each([
  ['source', helpers],
  ['served minified', servedHelpers],
])('%s helpers', (_label, helperSource) => {
  test('the actual diagnostic is ES5 syntax and precedes the exact server asset marker', () => {
    const fixture = mount({}, helperSource);
    try {
      expect(template.split(assetsMarker)).toHaveLength(2);
      expect(fixture.scripts).toHaveLength(4);
      expect(fixture.scripts[0].textContent).toBe(helperSource);
      const diagnostic = fixture.scripts[1];
      expect(diagnostic.previousElementSibling).toBe(fixture.notice);
      expect(fixture.scripts[2].textContent).toBe('observeAssets();');
      expect(() =>
        parse(diagnostic.textContent!, { ecmaVersion: 5 }),
      ).not.toThrow();
      expect(fixture.notice.style.display).toBe('none');
      expect(fixture.notice.getAttribute('role')).toBe('alert');
      expect(fixture.notice.textContent).toContain('legacy Internet Explorer');
      expect(fixture.notice.textContent).toContain('Update BYOND');
      expect(fixture.notice.style.backgroundColor).toBe('#242424');
      expect(fixture.notice.style.color).toBe('#ffffff');
      // Computed styles are fixture evidence, not native IE layout proof.
      const fatal = fixture.document.getElementById('FatalError')!;
      fatal.className = 'FatalError FatalError--visible';
      const fatalStyle = fixture.browser.getComputedStyle(fatal);
      expect(fatalStyle.display).toBe('block');
      expect(
        Number(fixture.browser.getComputedStyle(fixture.notice).zIndex),
      ).toBeGreaterThan(Number(fatalStyle.zIndex));
    } finally {
      fixture.browser.happyDOM.abort();
    }
  });

  for (const documentMode of [5, 7, 8, 9, 10, 11]) {
    test(`IE document mode ${documentMode} sees the notice before assets, without bridge identity changes`, () => {
      const fixture = mount({ documentMode, userAgent: ie }, helperSource);
      try {
        fixture.execute(0);
        const byond = fixture.context.Byond;
        const onerror = fixture.context.onerror;
        const update = fixture.context.update;
        expect(byond.IS_BYOND).toBeUndefined();
        fixture.execute(1);
        expect(fixture.context.Byond).toBe(byond);
        expect(fixture.context.onerror).toBe(onerror);
        expect(fixture.context.update).toBe(update);
        expect(fixture.bridgeCalls).toEqual([]);
        fixture.execute(2);
        expect(fixture.observations).toEqual([{ display: 'block', calls: [] }]);
        expect(fixture.browser.getComputedStyle(fixture.notice).display).toBe(
          'block',
        );
        // A subsequent asset parse failure cannot undo the already-shown notice.
        expect(() => runInContext('var = ;', fixture.context)).toThrow();
        expect(fixture.notice.style.display).toBe('block');
        fixture.execute(3);
        expect(fixture.bridgeCalls).toEqual([]);
      } finally {
        fixture.browser.happyDOM.abort();
      }
    });
  }

  const cases: (FixtureOptions & {
    name: string;
    isByond: boolean | undefined;
  })[] = [
    { name: 'Chromium loopback', isByond: true },
    { name: 'CEF loopback', cef: true, userAgent: 'CEF', isByond: true },
    { name: 'Chromium external query', search: '?external', isByond: false },
    {
      name: 'CEF external query',
      cef: true,
      search: '?external',
      isByond: false,
    },
    { name: 'Chromium remote host', hostname: 'example.test', isByond: false },
    { name: 'other browser', userAgent: 'Firefox/140.0', isByond: undefined },
    { name: 'zero document mode', documentMode: 0, isByond: true },
  ];

  for (const { name, isByond, ...options } of cases) {
    test(`${name} remains hidden and preserves helpers and ready routing`, () => {
      const fixture = mount(options, helperSource);
      try {
        fixture.execute(0);
        const byond = fixture.context.Byond;
        const sendMessage = byond.sendMessage;
        const onerror = fixture.context.onerror;
        const update = fixture.context.update;
        expect(byond.IS_BYOND).toBe(isByond);
        expect(byond.windowId).toBe('legacy-notice-test');
        fixture.execute(1);
        expect(fixture.context.Byond).toBe(byond);
        expect(byond.sendMessage).toBe(sendMessage);
        expect(fixture.context.onerror).toBe(onerror);
        expect(fixture.context.update).toBe(update);
        fixture.execute(2);
        expect(fixture.observations).toEqual([{ display: 'none', calls: [] }]);
        expect(fixture.browser.getComputedStyle(fixture.notice).display).toBe(
          'none',
        );
        fixture.execute(3);
        expect(fixture.bridgeCalls).toEqual(
          isByond
            ? [
                'byond://?type=ready&payload=&tgui=1&window_id=legacy-notice-test',
              ]
            : [],
        );
      } finally {
        fixture.browser.happyDOM.abort();
      }
    });
  }
});
