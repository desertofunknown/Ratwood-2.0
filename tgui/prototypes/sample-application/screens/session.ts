import type { Controller as ArchiveController } from '../../changes-archive/model';
import {
  sampleController as createArchiveSample,
  type SampleOptions as ArchiveOptions,
  type Scenario as ArchiveScenario,
} from '../../changes-archive/sample';
import {
  type Controller as SettingsController,
  createController as createSettingsController,
} from '../../display-readability/model';
import { createSample as createSettingsSample } from '../../display-readability/sample';
import {
  createMarketController,
  type MarketController,
} from '../../market-quote/model';
import {
  type Controller as LedgerController,
  createController as createLedgerController,
} from '../../treasury-ledger/model';
import { createSample as createLedgerSample } from '../../treasury-ledger/sample';
import type { Route, ScreenSession, SessionContext } from '../contracts';
import { createDialogController } from '../dialogs/controller';
import {
  createWorkbenchSession,
  type SessionClock,
  sessionScope,
  type WorkbenchSession,
} from './session-core';

export type DialogSession = ScreenSession & {
  route: 'dialogs';
  controller: ReturnType<typeof createDialogController>;
};

type TreasurySession = ScreenSession & {
  route: 'treasury';
  controller: LedgerController;
};
type MarketSession = ScreenSession & {
  route: 'market';
  controller: MarketController;
};
type ReadabilitySession = ScreenSession & {
  route: 'readability';
  controller: SettingsController;
  pendingCount(): number;
  subscribePending(notify: () => void): () => void;
  deliverNext(): void;
};
export type ArchiveSnapshot = Readonly<{
  scenario: ArchiveScenario;
  sampleEpoch: number;
  controller: ArchiveController;
}>;
export type ArchiveSession = ScreenSession & {
  route: 'archive';
  snapshot(): ArchiveSnapshot;
  subscribe(notify: () => void): () => void;
  selectSample(scenario: ArchiveScenario): void;
};
export type OwnedScreenSession =
  | WorkbenchSession
  | TreasurySession
  | MarketSession
  | ReadabilitySession
  | ArchiveSession
  | DialogSession;

export type ScreenSessionOptions = SessionClock & {
  /** Sample-only archive scenarios and deterministic asynchronous test delivery. */
  archive?: Pick<ArchiveOptions, 'fetch'> & { scenario?: ArchiveScenario };
};

/** One private source/controller per route visit, never a cross-route cache. */
export function createScreenSession(
  route: Route,
  context: SessionContext,
  options: ScreenSessionOptions = {},
): OwnedScreenSession {
  if (route === 'workbench') return createWorkbenchSession(context, options);
  const { lease, validateBoundary } = context;
  validateBoundary();
  const scope = sessionScope(context, options);
  if (route === 'dialogs') {
    const controller = createDialogController(context);
    return { route, lease, controller, retire: controller.retire };
  }
  if (route === 'treasury') {
    const sample = createLedgerSample(
      { schedule: scope.schedule, cancel: scope.cancel },
      validateBoundary,
    );
    const raw = scope.construct(
      () =>
        createLedgerController(
          {
            action: scope.gate(sample.action),
            subscribe: (deliver) => scope.subscribe(sample.subscribe, deliver),
            schedule: scope.schedule,
            cancel: scope.cancel,
          },
          validateBoundary,
        ),
      sample.dispose,
    );
    const controller: LedgerController = {
      snapshot: raw.snapshot,
      subscribe: (notify) => scope.subscribe(raw.subscribe, notify),
      open: scope.gate(raw.open),
      close: scope.gate(raw.close),
      draft: scope.gate(raw.draft),
      clear: scope.gate(raw.clear),
      page: scope.gate(raw.page),
      refresh: scope.gate(raw.refresh),
    };
    return {
      route,
      lease,
      controller,
      retire: () => scope.retire(raw.close, sample.dispose),
    };
  }
  if (route === 'readability') {
    const sample = createSettingsSample(undefined, validateBoundary);
    const pendingListeners = new Set<() => void>();
    const publishPending = () => {
      if (scope.current()) pendingListeners.forEach((notify) => notify());
    };
    const raw = scope.construct(
      () =>
        createSettingsController(
          {
            subscribe: (deliver) => scope.subscribe(sample.subscribe, deliver),
            action: scope.gate((...command) => {
              sample.action(...command);
              publishPending();
            }),
          },
          validateBoundary,
        ),
      sample.dispose,
    );
    const controller: SettingsController = {
      snapshot: raw.snapshot,
      subscribe: (notify) => scope.subscribe(raw.subscribe, notify),
      open: scope.gate(raw.open),
      close: scope.gate(raw.close),
      toggle: scope.gate(raw.toggle),
      select: scope.gate(raw.select),
    };
    return {
      route,
      lease,
      controller,
      pendingCount: sample.pendingCount,
      subscribePending: (notify) =>
        scope.subscribe((listener) => {
          pendingListeners.add(listener);
          return () => {
            pendingListeners.delete(listener);
          };
        }, notify),
      deliverNext: scope.gate(() => {
        sample.deliverNext();
        publishPending();
      }),
      retire: () =>
        scope.retire(() => pendingListeners.clear(), raw.close, sample.dispose),
    };
  }
  if (route === 'archive') {
    const listeners = new Set<() => void>();
    let sampleEpoch = 0;
    const report = (error: unknown) => {
      try {
        context.lifecycle.error(error);
      } catch {
        // A diagnostic must never prevent the remaining owned cleanup.
      }
    };
    const createSample = (scenario: ArchiveScenario) => {
      const sampleScope = sessionScope(
        { ...context, lifecycle: { ...context.lifecycle, error: report } },
        options,
      );
      let raw: ArchiveController | undefined;
      const validateSampleBoundary = () => {
        // Construction validates before the lease is published; retired async
        // deliveries must not even inspect a replacement endpoint.
        if (raw && !sampleScope.current()) return;
        try {
          validateBoundary();
        } catch (error) {
          if (raw) {
            // Invalidate the raw request before its catch can schedule retry.
            sampleScope.retire(raw.unmount);
            report(error);
          }
          throw error;
        }
      };
      const boundaryCurrent = () => {
        if (!sampleScope.current()) return false;
        try {
          validateSampleBoundary();
          return sampleScope.current();
        } catch {
          return false;
        }
      };
      raw = createArchiveSample(
        scenario,
        {
          fetch: options.archive?.fetch,
          schedule: (callback, delay) =>
            sampleScope.schedule(() => {
              // The unchanged model's action occurs outside its async try.
              if (boundaryCurrent()) callback();
            }, delay),
          cancel: sampleScope.cancel,
        },
        validateSampleBoundary,
      ).controller;
      const source = raw;
      const controller: ArchiveController = {
        dates: source.dates,
        labels: source.labels,
        snapshot: source.snapshot,
        subscribe: (notify) => sampleScope.subscribe(source.subscribe, notify),
        mount() {
          if (boundaryCurrent()) source.mount();
        },
        unmount: sampleScope.gate(source.unmount),
        select(index) {
          if (boundaryCurrent()) source.select(index);
        },
        query(query) {
          if (boundaryCurrent()) source.query(query);
        },
      };
      return {
        snapshot: Object.freeze({
          scenario,
          sampleEpoch: ++sampleEpoch,
          controller,
        }),
        current: boundaryCurrent,
        retire: () => sampleScope.retire(source.unmount),
      };
    };
    let sample = createSample(options.archive?.scenario ?? 'success');
    return {
      route,
      lease,
      snapshot: () => sample.snapshot,
      subscribe: (notify) =>
        scope.subscribe((listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }, notify),
      selectSample: scope.gate((scenario) => {
        if (!sample.current()) return;
        const next = createSample(scenario);
        // Invalidate old retries and promises before either view can commit.
        sample.retire();
        sample = next;
        listeners.forEach((notify) => notify());
      }),
      retire: () =>
        scope.retire(
          () => listeners.clear(),
          () => sample.retire(),
        ),
    };
  }
  const raw = createMarketController(undefined, validateBoundary);
  const controller: MarketController = {
    snapshot: raw.snapshot,
    getSnapshot: raw.getSnapshot,
    subscribe: (notify) => scope.subscribe(raw.subscribe, notify),
    selectSample: scope.gate(raw.selectSample),
    selectCategory: scope.gate(raw.selectCategory),
    toggleExpanded: scope.gate(raw.toggleExpanded),
    openQuote: scope.gate(raw.openQuote),
    setQuantity: scope.gate(raw.setQuantity),
    changeQuantity: scope.gate(raw.changeQuantity),
    fillQuantity: scope.gate(raw.fillQuantity),
    deliver: scope.gate(raw.deliver),
    deliverPreview: scope.gate(raw.deliverPreview),
    closeQuote: scope.gate(raw.closeQuote),
    setSequestered: scope.gate(raw.setSequestered),
    dispose: scope.gate(raw.dispose),
  };
  return {
    route,
    lease,
    controller,
    retire: () => scope.retire(raw.dispose),
  };
}
