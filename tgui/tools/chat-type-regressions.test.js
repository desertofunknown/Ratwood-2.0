// Regression coverage for the narrow guard and leash-caller fix adapted from
// Animusin/Ratwood-2.0 PR #110, commit 052263e19ec7b479f95f36238bcda86897366967:
// https://github.com/Animusin/Ratwood-2.0/commit/052263e19ec7b479f95f36238bcda86897366967
// Only those two production changes are adapted; the renderer MIT header and
// repository AGPL attribution are preserved. These Happy DOM/VM checks exercise
// production message processing, not a live BYOND client or React component UI.

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const { Window } = require('happy-dom');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const chatDirectory = path.join(root, 'packages/tgui-panel/chat');

// Execute the actual renderer, model, selectors and text helpers. Only external
// UI dependencies and scheduling are stubbed. Each case has its own module cache
// and VM, so no Bun module mocks or browser globals leak into other suites.
function harness(t) {
  const window = new Window();
  t.after(() => window.happyDOM.abort());
  const events = [];
  const cache = new Map();
  const context = vm.createContext({
    window,
    document: window.document,
    console,
    Date,
    performance,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    setInterval: () => 1,
    setTimeout: () => 1,
    clearTimeout() {},
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  const stubs = {
    'tgui-core/uuid': { createUuid: () => 'test-page' },
    'tgui-core/events': {
      EventEmitter: class {
        emit(...args) {
          events.push(args);
        }
        on() {}
      },
    },
    'tgui-core/react': { classes: (items) => items.filter(Boolean).join(' ') },
    'tgui/logging': { createLogger: () => ({ debug() {}, error() {} }) },
    react: {},
    'react-dom/client': {},
    'tgui/components/TooltipHTML': {},
    'tgui-core/components': {},
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const filename = path.join(chatDirectory, name);
    const source = readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    }).outputText;
    const module = { exports: {} };
    cache.set(name, module);
    const requireLocal = (id) => {
      if (id.startsWith('./')) {
        const base = id.slice(2);
        const resolved = [base, base + '.js', base + '.jsx', base + '.ts'].find(
          (file) => existsSync(path.join(chatDirectory, file)),
        );
        assert.ok(resolved, `Missing chat dependency: ${id}`);
        return load(resolved);
      }
      assert.ok(Object.hasOwn(stubs, id), `Unexpected UI dependency: ${id}`);
      return stubs[id];
    };
    vm.runInContext(
      `(function(require,module,exports){${compiled}\n})`,
      context,
      {
        filename,
      },
    )(requireLocal, module, module.exports);
    return module.exports;
  }
  const renderer = load('renderer.jsx').chatRenderer;
  const model = load('model.js');
  renderer.loaded = true;
  renderer.rootNode = window.document.createElement('div');
  renderer.scrollNode = window.document.createElement('div');
  renderer.scrollTracking = false;
  renderer.page = model.createMainPage();
  return { renderer, model, events };
}

const invalidTypes = [
  ['null', null],
  ['undefined', undefined],
  ['empty string', ''],
  ['numeric legacy flag', 1],
  ['zero', 0],
  ['true', true],
  ['false', false],
  ['object', {}],
  ['array', []],
];
for (const [label, type] of invalidTypes) {
  test(`chat infers ${label} and preserves the rest of the batch`, (t) => {
    const { renderer, events } = harness(t);
    renderer.processBatch([
      { type, html: '<span class="say">Hello</span>' },
      { type: 'ooc', text: 'Following message' },
    ]);
    assert.deepEqual(
      Array.from(renderer.messages, (m) => m.type),
      ['localchat', 'ooc'],
    );
    assert.equal(renderer.visibleMessages.length, 2);
    assert.equal(renderer.rootNode.textContent, 'HelloFollowing message');
    assert.equal(events.length, 1);
    assert.equal(events[0][0], 'batchProcessed');
    assert.equal(events[0][1].localchat, 1);
    assert.equal(events[0][1].ooc, 1);
  });
}

test('chat retains selector priority and unknown fallback without coercion', (t) => {
  const { renderer } = harness(t);
  renderer.processBatch([
    { type: 1, html: '<span class="say notice">Local before info</span>' },
    { type: true, html: '<span class="notice">Escaped collar</span>' },
    { type: {}, text: 'Plain fallback' },
    { type: [], html: '<span>HTML fallback</span>' },
    {
      type: {
        toString() {
          throw new Error('Do not coerce');
        },
      },
      text: 'Object fallback',
    },
  ]);
  assert.deepEqual(
    Array.from(renderer.messages, (m) => m.type),
    ['localchat', 'info', 'unknown', 'unknown', 'unknown'],
  );
  assert.equal(renderer.visibleMessages.length, 5);
});

test('chat preserves explicit strings, filtering and internal message behavior', (t) => {
  const { renderer } = harness(t);
  renderer.page.acceptedTypes.ooc = false;
  renderer.processBatch([
    { type: 'ooc', html: '<span class="say">Hidden explicit OOC</span>' },
    {
      type: 'localchat',
      html: '<span class="notice">Visible explicit local</span>',
    },
    { type: 'custom/type', text: 'Custom stays custom' },
    { type: ' ', text: 'Whitespace stays a string' },
    { type: 'internal/reconnected' },
    { type: 'internal/custom', text: 'Internal stays visible' },
  ]);
  assert.deepEqual(
    Array.from(renderer.messages, (m) => m.type),
    [
      'ooc',
      'localchat',
      'custom/type',
      ' ',
      'internal/reconnected',
      'internal/custom',
    ],
  );
  assert.deepEqual(
    Array.from(renderer.visibleMessages, (m) => m.type),
    ['localchat', 'internal/reconnected', 'internal/custom'],
  );
  assert.equal(renderer.messages[4].node.className, 'Chat__reconnected');
});

test('inferred types survive duplicates, serialization, history and rebuild', (t) => {
  const { renderer, model } = harness(t);
  renderer.processBatch([
    { type: 1, html: '<span class="notice">Repeated</span>' },
    { type: true, html: '<span class="notice">Repeated</span>' },
    { type: [], text: 'Current' },
  ]);
  assert.equal(renderer.messages.length, 2);
  assert.equal(renderer.messages[0].times, 2);
  assert.equal(
    renderer.messages[0].node.querySelector('.Chat__badge').textContent,
    '2',
  );
  const saved = JSON.parse(
    JSON.stringify(model.serializeMessage(renderer.messages[0])),
  );
  assert.equal(saved.type, 'info');
  assert.equal(saved.times, 2);
  assert.equal(Object.hasOwn(saved, 'node'), false);
  renderer.processBatch(
    [
      { type: {}, text: 'Older history' },
      { ...saved, html: '<span class="notice">Saved history</span>' },
    ],
    { prepend: true, notifyListeners: false },
  );
  assert.deepEqual(
    Array.from(renderer.messages, (m) => m.type),
    ['unknown', 'info', 'info', 'unknown'],
  );
  const before = renderer.rootNode.textContent;
  renderer.rebuildChat();
  assert.equal(renderer.rootNode.textContent, before);
  assert.equal(renderer.messages[1].times, 2);
  assert.equal(renderer.messages[2].times, 2);
  const page = model.createMainPage();
  page.acceptedTypes.info = false;
  renderer.changePage(page);
  assert.equal(renderer.rootNode.textContent, 'Older historyCurrent');
});

test('leash escape caller no longer passes a numeric flag into the type slot', () => {
  const proc = readFileSync(
    path.join(root, '../code/modules/tgchat/to_chat.dm'),
    'utf8',
  );
  assert.match(proc, /\/proc\/to_chat\(\s*target,\s*html,\s*type = null,/);
  const leash = readFileSync(
    path.join(root, '../code/game/objects/items/rogueitems/leash.dm'),
    'utf8',
  );
  const calls = leash
    .split('\n')
    .filter((line) => line.includes('has escaped their collar!!'));
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].trim(),
    `to_chat(leash_master, "<span class='notice'>[leash_pet] has escaped their collar!!</span>")`,
  );
});
