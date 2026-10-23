/** Actual renderer fixtures, shared by local happyDOM tests and browser preview.
 * Synthetic inert HTML only. This is parity evidence, not sanitizer validation.
 */
export function compareRendererSnapshots(
  baseline: unknown,
  candidate: unknown,
) {
  if (JSON.stringify(baseline) !== JSON.stringify(candidate)) {
    throw new Error('Actual renderer differential snapshots differ');
  }
  return true;
}

export async function runRendererFixtures(renderer: any) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const events: unknown[] = [];
  const snapshots: unknown[] = [];
  const listener = (counts: unknown) => events.push({ ...(counts as object) });
  const page = {
    acceptedTypes: { unknown: true, localchat: true, system: true },
  };
  const snapshot = (label: string) => {
    snapshots.push({
      label,
      html: root.innerHTML.replaceAll('Chat__badge--animate', ''),
      highlights: root.querySelectorAll('.Chat__highlight').length,
      visibleOrder: renderer.visibleMessages.map((m: any) => m.id),
      stored: renderer.messages.map((m: any) => ({
        id: m.id,
        type: m.type,
        text: m.text,
        html: m.html,
        times: m.times,
        avoidHighlighting: m.avoidHighlighting,
        node: m.node.outerHTML.replaceAll('Chat__badge--animate', ''),
        images: m.images?.length || 0,
        components: m.componentRoots?.length || 0,
      })),
      events: structuredClone(events),
    });
  };
  const reset = () => {
    for (const message of new Set([
      ...renderer.messages,
      ...renderer.visibleMessages,
    ])) {
      renderer.disposeMessage(message);
    }
    renderer.messages = [];
    renderer.visibleMessages = [];
    renderer.queue = [];
    renderer.loaded = true;
    renderer.page = page;
    renderer.scrollTracking = false;
    renderer.setHighlight(null, {});
    root.textContent = '';
  };
  const settings = (overrides = {}) => ({
    highlightText: 'warden, /bell+/',
    highlightColor: '#ffc857',
    highlightWholeMessage: true,
    matchWord: false,
    matchCase: false,
    ...overrides,
  });
  reset();
  renderer.mount(root);
  renderer.events.on('batchProcessed', listener);
  try {
    renderer.setHighlight(['a', 'b'], {
      a: settings(),
      b: settings({ highlightText: 'warden', highlightColor: '#8bd3dd' }),
    });
    renderer.processBatch([
      { id: 'nested', html: '<b>WARDEN <i>bell</i></b><span> warden</span>' },
      { id: 'repeat-1', type: 'localchat', text: 'warden repeated' },
      { id: 'repeat-2', type: 'localchat', text: 'warden repeated' },
      {
        id: 'avoid',
        type: 'unknown',
        text: 'warden avoided',
        avoidHighlighting: true,
      },
      { id: 'reconnected', type: 'internal/reconnected' },
      { id: 'internal', type: 'internal/fixture', text: 'warden internal' },
      { id: 'hidden', type: 'ooc', text: 'warden hidden' },
      {
        id: 'link',
        type: 'unknown',
        html: '<span class="linkify">https://example.invalid/warden</span>',
      },
      {
        id: 'image',
        type: 'unknown',
        html: '<img alt="inert fixture">warden image',
      },
      {
        id: 'component',
        type: 'unknown',
        html: '<span data-component="UnknownFixture">warden component</span>',
      },
      {
        id: 'detected',
        html: '<span class="boldannounce">warden announcement</span>',
      },
    ]);
    const reused = document.createElement('div');
    reused.textContent = 'warden reused without processing';
    renderer.processBatch([{ id: 'reuse', type: 'unknown', node: reused }]);
    if (renderer.messages.at(-1).node !== reused)
      throw new Error('Reused-node identity changed');
    snapshot(
      'initial: nested, overlap, combine, exclusions, types, inert fixtures',
    );
    renderer.changePage({ acceptedTypes: { ooc: true } });
    snapshot('hidden tab');
    renderer.changePage(page);
    renderer.processBatch(
      [{ id: 'restored', type: 'unknown', text: 'warden restored' }],
      { prepend: true, notifyListeners: false },
    );
    snapshot('restore prepended silently');
    renderer.setHighlight(['new'], {
      new: settings({
        highlightText: 'warden',
        highlightColor: '#ff0000',
        highlightWholeMessage: false,
      }),
    });
    renderer.processBatch([
      { id: 'new-settings', type: 'unknown', text: 'warden changed color' },
    ]);
    snapshot('settings replaced, existing nodes preserved');
    renderer.rebuildChat();
    snapshot('rebuild uses replacement settings without events');
    if (
      root.querySelector('.Chat__highlight')?.getAttribute('style') !==
      'background-color:#ff0000'
    ) {
      throw new Error('Replacement color was not applied during rebuild');
    }
    for (const clearSettings of [null, []]) {
      reset();
      renderer.setHighlight(['old'], { old: settings() });
      renderer.setHighlight(clearSettings, {});
      renderer.processBatch([
        { id: 'cleared', type: 'unknown', text: 'warden' },
      ]);
      if (root.querySelector('.Chat__highlight'))
        throw new Error('Highlight clearing failed');
      snapshot(
        clearSettings === null
          ? 'null clears highlighting'
          : 'empty list clears highlighting',
      );
    }
    reset();
    renderer.loaded = false;
    renderer.processBatch([
      { id: 'queued-live', type: 'unknown', text: 'live' },
    ]);
    renderer.processBatch(
      [{ id: 'queued-restore', type: 'unknown', text: 'history' }],
      { prepend: true, notifyListeners: false },
    );
    renderer.onStateLoaded();
    snapshot('queued restoration precedes live and preserves notifications');
    for (const [label, configuration] of [
      ['words', settings({ highlightText: 'warden, bell' })],
      ['regex', settings({ highlightText: '/ward(en)?/' })],
      ['invalid regex plus words', settings({ highlightText: '/(/, warden' })],
      ['zero length', settings({ highlightText: '/(?:)/' })],
      [
        'punctuation and Cyrillic',
        settings({
          highlightText: 'foo-bar, ёжик, WARDEN',
          matchWord: true,
          matchCase: true,
        }),
      ],
      ['empty', settings({ highlightText: '' })],
    ] as const) {
      reset();
      renderer.setHighlight(['x'], { x: configuration });
      renderer.processBatch([
        {
          id: label,
          type: 'unknown',
          text: 'WARDEN warden bell foo-bar ёжик ЁЖИК wardens',
        },
      ]);
      snapshot(label);
    }
    reset();
    renderer.setHighlight(['classifier'], {
      classifier: settings({ highlightText: 'warden' }),
    });
    const classificationCases = [
      ['say', 'say', 'localchat'],
      ['radio', 'radio', 'radio'],
      ['notice', 'notice', 'info'],
      ['warning', 'warning', 'warning'],
      ['notice-pm', 'notice pm', 'adminpm'],
      ['warning-pm', 'warning pm', 'adminpm'],
      ['danger', 'danger', 'combat'],
      ['competing-priority', 'say danger', 'localchat'],
    ];
    renderer.processBatch(
      classificationCases.map(([id, classes]) => ({
        id,
        html: `<span class="${classes}">warden ${id}</span>`,
      })),
    );
    const rootOnly = document.createElement('div');
    rootOnly.className = 'say';
    rootOnly.textContent = 'warden root-only';
    renderer.processBatch([
      { id: 'root-only', node: rootOnly },
      {
        id: 'explicit-type',
        type: 'ooc',
        html: '<span class="say">warden explicit override</span>',
      },
    ]);
    const expectedTypes = Object.fromEntries([
      ...classificationCases.map(([id, , type]) => [id, type]),
      ['root-only', 'unknown'],
      ['explicit-type', 'ooc'],
    ]);
    for (const message of renderer.messages) {
      if (message.type !== expectedTypes[message.id]) {
        throw new Error(
          `Classification fixture ${message.id}: expected ${expectedTypes[message.id]}, got ${message.type}`,
        );
      }
    }
    snapshot(
      'classification selectors, pm exclusions, priority, root-only, explicit type',
    );
    return snapshots;
  } finally {
    renderer.events.off('batchProcessed', listener);
    reset();
    renderer.unmount(root);
    renderer.rootNode = null;
    root.remove();
  }
}
