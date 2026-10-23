import { useSyncExternalStore } from 'react';

import { MARKET_SAMPLES } from '../../market-quote/model';
import type { OwnedScreenSession } from './session';

function ReadabilityControls({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'readability' }>;
}) {
  const pending = useSyncExternalStore(
    session.subscribePending,
    session.pendingCount,
  );
  return (
    <div className="SampleApplication__screenControls">
      <p>
        Synthetic settings only. Commands queue sample updates; displayed values
        change only on delivery. No native effects or saving occur.
      </p>
      <button
        type="button"
        className="TithewoodControl"
        data-sample-deliver="readability"
        disabled={pending === 0}
        onClick={session.deliverNext}
      >
        Deliver next sample update
      </button>
      <p role="status" data-sample-status="readability">
        Queued sample updates: {pending}.
      </p>
    </div>
  );
}

function MarketControls({
  session,
}: {
  session: Extract<OwnedScreenSession, { route: 'market' }>;
}) {
  const { controller } = session;
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  return (
    <div className="SampleApplication__screenControls">
      <p>
        Authored quotes only. No economic calculation, live request, shipment,
        price reservation or saving occurs.
      </p>
      <label>
        Sample scenario{' '}
        <select
          className="TithewoodControl"
          aria-label="Sample scenario"
          value={state.sample.id}
          onChange={(event) =>
            controller.selectSample(event.currentTarget.value)
          }
        >
          {MARKET_SAMPLES.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="TithewoodControl"
        data-sample-deliver="market-current"
        onClick={() => controller.deliverPreview('current')}
      >
        Deliver recorded quote
      </button>
      <button
        type="button"
        className="TithewoodControl"
        data-sample-deliver="market-stale"
        onClick={() => controller.deliverPreview('stale')}
      >
        Deliver stale response
      </button>
      <button
        type="button"
        className="TithewoodControl"
        data-sample-deliver="market-rejected"
        onClick={() => controller.deliverPreview('rejected')}
      >
        Deliver rejected response
      </button>
      <button
        type="button"
        className="TithewoodControl"
        data-sample-sequestration=""
        onClick={() =>
          controller.setSequestered(
            !controller.snapshot().data.sequestration.active,
          )
        }
      >
        Toggle sequestration
      </button>
      <p role="status" data-sample-status="market">
        {state.sample.description}{' '}
        {state.request
          ? state.deliveryNote || 'No new recorded response delivered.'
          : 'Choose a region to inspect.'}{' '}
        No shipment actions exist in this sample.
      </p>
    </div>
  );
}

/** Identical local demonstration controls for both presentation arms. */
export function ScreenControls({ session }: { session: OwnedScreenSession }) {
  if (session.route === 'readability') {
    return <ReadabilityControls session={session} />;
  }
  if (session.route === 'market') return <MarketControls session={session} />;
  if (session.route === 'treasury') {
    return (
      <p className="SampleApplication__screenControls">
        Synthetic treasury records only. Search, refresh and paging stay in
        memory. Leaving this screen resets its sample.
      </p>
    );
  }
  return null;
}
