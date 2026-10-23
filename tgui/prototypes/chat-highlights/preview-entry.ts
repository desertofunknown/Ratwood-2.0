import { messages, scenarios, settings } from './fixtures';
import { runRendererFixtures } from './tests/renderer-fixtures';

declare const PREVIEW_VARIANT: string;
const fixtureLogs: unknown[] = [];
// Install before loading production modules. No subscriptions, persistence,
// helpers, saveBlob, BYOND calls or native transports are permitted.
Object.defineProperty(window, 'Byond', {
  configurable: false,
  writable: false,
  value: new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === 'sendMessage') {
        return (payload: any) => {
          if (
            payload?.type !== 'log' ||
            payload.ns !== 'chatRenderer' ||
            typeof payload.message !== 'string'
          ) {
            throw Error(
              'Disconnected preview rejected non-fixture native message',
            );
          }
          fixtureLogs.push({ ...payload });
        };
      }
      throw Error(`Disconnected preview rejected Byond.${String(key)}`);
    },
    set() {
      throw Error('Disconnected preview rejected native mutation');
    },
  }),
});

const output = document.querySelector<HTMLPreElement>('#output')!;
const status = document.querySelector<HTMLElement>('#status')!;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
viewport.addEventListener('click', (event) => {
  if ((event.target as Element).closest('a')) event.preventDefault();
});
const controls = [
  ...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    'button,input',
  ),
];
const emit = (value: unknown) => {
  output.textContent = JSON.stringify(value, null, 2);
};
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function main() {
  const { chatRenderer: renderer } = await import(
    '../../packages/tgui-panel/chat/renderer.jsx'
  );
  const { createMainPage } = await import(
    '../../packages/tgui-panel/chat/model'
  );
  const reset = () => {
    fixtureLogs.length = 0;
    renderer.unmount(renderer.rootNode);
    for (const message of new Set([
      ...renderer.messages,
      ...renderer.visibleMessages,
    ])) {
      renderer.disposeMessage(message);
    }
    renderer.rootNode = null;
    renderer.messages = [];
    renderer.visibleMessages = [];
    renderer.queue = [];
    renderer.page = createMainPage();
    renderer.loaded = true;
    renderer.highlightParsers = null;
    renderer.scrollTracking = true;
    renderer.scrollTop = 0;
    viewport.replaceChildren();
    const root = document.createElement('div');
    root.className = 'Chat';
    viewport.appendChild(root);
    renderer.mount(root);
  };
  const configure = (scenario: (typeof scenarios)[number]) => {
    const { ids, byId } = settings(scenario);
    renderer.setHighlight(ids, byId);
  };
  const signature = () => {
    const html = renderer.rootNode.innerHTML;
    let hash = 2166136261;
    for (let i = 0; i < html.length; i++) {
      hash = Math.imul(hash ^ html.charCodeAt(i), 16777619);
    }
    const types: Record<string, number> = {};
    for (const message of renderer.messages) {
      types[message.type] = (types[message.type] || 0) + 1;
    }
    return {
      messages: renderer.messages.length,
      visible: renderer.visibleMessages.length,
      highlights: renderer.rootNode.querySelectorAll('.Chat__highlight').length,
      htmlLength: html.length,
      htmlFNV1a: (hash >>> 0).toString(16),
      types,
    };
  };
  const time = (operation: () => void) => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  };
  const metadata = () => ({
    variant: PREVIEW_VARIANT,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    visibility: document.visibilityState,
    timer: 'performance.now',
    units: 'milliseconds',
    statistics:
      'Median averages the two middle samples for even n; p95 uses nearest rank. All warmups and samples retained.',
    lifecycle:
      'One frozen historical renderer singleton (not current production) and its single pruning interval per page; dispose/unmount and fresh root/state outside each timed sample. No replacement constructors.',
    boundary:
      'Synchronous mounted renderer methods only; excludes paint, animation frames, pruning callbacks, input generation, reset and DOM cleanup. Not CPU time, FPS, frame time or real-game latency.',
  });
  const run = async (operation: () => Promise<void>) => {
    controls.forEach((control) => {
      control.disabled = true;
    });
    status.textContent =
      'Running. Keep this tab visible; controls are disabled.';
    try {
      await pause();
      await operation();
      status.textContent = 'Finished. Raw results below; no outliers removed.';
    } catch (error) {
      status.textContent = 'Failed; no performance conclusion.';
      emit({ error: String(error), stack: (error as Error).stack });
    } finally {
      controls.forEach((control) => {
        control.disabled = false;
      });
    }
  };
  document.querySelector('#correctness')!.addEventListener('click', () =>
    run(async () => {
      reset();
      const snapshots = await runRendererFixtures(renderer);
      emit({ ...metadata(), kind: 'correctness', snapshots, fixtureLogs });
      reset();
      configure('mixed');
      renderer.processBatch(messages('mixed', 20));
    }),
  );
  document.querySelector('#benchmark')!.addEventListener('click', () =>
    run(async () => {
      const samples = Number(
        (document.querySelector('#samples') as HTMLInputElement).value,
      );
      const warmups = Number(
        (document.querySelector('#warmups') as HTMLInputElement).value,
      );
      if (
        !Number.isInteger(samples) ||
        samples < 1 ||
        samples > 100 ||
        !Number.isInteger(warmups) ||
        warmups < 0 ||
        warmups > 20
      ) {
        throw Error('Samples must be 1–100; warmups 0–20.');
      }
      const results: unknown[] = [];
      const result = {
        ...metadata(),
        kind: 'benchmark',
        samples,
        warmups,
        noOutliersRemoved: true,
        results,
      };
      emit(result);
      for (const scenario of scenarios) {
        // Generated before timing, with fresh payload objects for every sample.
        const raw: Record<string, number[]> = {
          settingsUpdate: [],
          firstUseOneMessage: [],
          warmOneMessage: [],
          live1000SingleCalls: [],
          restore1000Batch: [],
          rebuild1000: [],
        };
        const warmupRaw: Record<string, number[]> = Object.fromEntries(
          Object.keys(raw).map((key) => [key, []]),
        );
        const signatures: unknown[] = [];
        for (let sample = -warmups; sample < samples; sample++) {
          const target = sample < 0 ? warmupRaw : raw;
          const first = messages(scenario, 1);
          const warmSingle = messages(scenario, 2);
          const live = messages(scenario, 1001);
          const restore = messages(scenario, 1000);
          const rebuild = messages(scenario, 1000);
          const sampleSignatures: Record<string, unknown> = { sample };
          reset();
          const config = settings(scenario);
          target.settingsUpdate.push(
            time(() => renderer.setHighlight(config.ids, config.byId)),
          );
          target.firstUseOneMessage.push(
            time(() => renderer.processBatch(first)),
          );
          sampleSignatures.firstUseOneMessage = signature();
          reset();
          configure(scenario);
          renderer.processBatch([warmSingle.shift()!]);
          target.warmOneMessage.push(
            time(() => renderer.processBatch(warmSingle)),
          );
          sampleSignatures.warmOneMessage = signature();
          reset();
          configure(scenario);
          // Prime only the prepared-highlighter first use, outside timing, then
          // retain that real live-style initial message equally in both variants.
          renderer.processBatch([live.shift()!]);
          target.live1000SingleCalls.push(
            time(() => {
              for (const payload of live) renderer.processBatch([payload]);
            }),
          );
          sampleSignatures.live1000SingleCalls = signature();
          reset();
          configure(scenario);
          target.restore1000Batch.push(
            time(() =>
              renderer.processBatch(restore, {
                prepend: true,
                notifyListeners: false,
              }),
            ),
          );
          sampleSignatures.restore1000Batch = signature();
          reset();
          configure(scenario);
          renderer.processBatch(rebuild, { notifyListeners: false });
          target.rebuild1000.push(time(() => renderer.rebuildChat()));
          sampleSignatures.rebuild1000 = signature();
          signatures.push(sampleSignatures);
          await pause();
        }
        const summary = Object.fromEntries(
          Object.entries(raw).map(([key, values]) => {
            const sorted = [...values].sort((a, b) => a - b);
            return [
              key,
              {
                n: values.length,
                min: sorted[0],
                median:
                  (sorted[(sorted.length - 1) >> 1] +
                    sorted[sorted.length >> 1]) /
                  2,
                p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
                max: sorted.at(-1),
                mean: values.reduce((sum, x) => sum + x, 0) / values.length,
              },
            ];
          }),
        );
        results.push({ scenario, raw, warmupRaw, summary, signatures });
        emit(result);
      }
      reset();
      configure('mixed');
      renderer.processBatch(messages('mixed', 20));
    }),
  );
  reset();
  configure('mixed');
  renderer.processBatch(messages('mixed', 20));
  status.textContent =
    'Ready. Run correctness in each arm before benchmarking.';
  addEventListener('pagehide', () => {
    renderer.unmount(renderer.rootNode);
    for (const message of renderer.messages) renderer.disposeMessage(message);
    renderer.loaded = false;
  });
}
main().catch((error) => {
  status.textContent = 'Initialization failed';
  emit({ error: String(error), stack: error.stack });
});
