import { assertDisconnected } from '../selection-prompt/network-guard';
import {
  createMarketController,
  MARKET_SAMPLES,
  type MarketController,
} from './model';

/** Explicit sample deliveries, never an economic calculator or live transport. */
export function preview(
  mount: (host: HTMLElement, controller: MarketController) => () => void,
) {
  const root = document.getElementById('root')!;
  const controls = document.getElementById('controls')!;
  try {
    assertDisconnected();
  } catch (error) {
    root.textContent = String(error);
    return;
  }
  controls.className = 'MarketPreview TithewoodSurface';
  const details = document.createElement('details');
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Disconnected market samples · controls';
  const note = document.createElement('p');
  note.textContent =
    'Authored example quotes only. Inspect a region, then explicitly deliver a recorded response. No economic calculation, live request, shipment, price reservation or saving occurs. Unlisted quantities have no recorded quote.';
  const actions = document.createElement('div');
  actions.className = 'MarketPreview__actions';
  const label = document.createElement('label');
  label.textContent = 'Sample scenario';
  const select = document.createElement('select');
  select.className = 'TithewoodControl';
  select.setAttribute('aria-label', 'Sample scenario');
  for (const sample of MARKET_SAMPLES) {
    const option = document.createElement('option');
    option.value = sample.id;
    option.textContent = sample.label;
    select.append(option);
  }
  label.append(select);
  actions.append(label);
  const status = document.createElement('p');
  status.dataset.testid = 'sample-status';
  status.setAttribute('role', 'status');
  let controller: MarketController | undefined;
  let cleanup: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  function close() {
    unsubscribe?.();
    unsubscribe = undefined;
    controller?.dispose();
    controller = undefined;
    cleanup?.();
    cleanup = undefined;
    root.replaceChildren();
    status.textContent =
      'Sample closed locally. No shipment or cancellation request sent.';
  }
  function open() {
    assertDisconnected();
    close();
    controller = createMarketController(select.value);
    const current = controller;
    function updateStatus() {
      const s = current.getSnapshot();
      status.textContent = `${s.sample.description} ${s.request ? `Draft ${s.draft.id}: ${s.request.side} ${s.request.goodId}, quantity ${JSON.stringify(s.draft.text)}. ${s.deliveryNote || 'No new recorded response delivered.'}` : 'Choose a region to inspect.'} No shipment actions exist in this preview.`;
    }
    unsubscribe = current.subscribe(updateStatus);
    cleanup = mount(root, current);
    updateStatus();
  }
  function button(text: string, handler: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'TithewoodControl';
    b.textContent = text;
    b.onclick = () => {
      assertDisconnected();
      handler();
    };
    actions.append(b);
  }
  select.onchange = open;
  button('Deliver recorded quote', () => controller?.deliverPreview('current'));
  button('Deliver stale response', () => controller?.deliverPreview('stale'));
  button('Deliver rejected response', () =>
    controller?.deliverPreview('rejected'),
  );
  button('Toggle sequestration', () =>
    controller?.setSequestered(
      !controller.getSnapshot().data.sequestration.active,
    ),
  );
  button('Close sample', close);
  button('Reopen sample', open);
  button('Hide controls until reload', () => {
    controls.hidden = true;
    root.querySelector<HTMLElement>('[data-market-category]')?.focus();
  });
  details.append(summary, note, actions);
  controls.replaceChildren(details, status);
  open();
  return () => {
    close();
    controls.replaceChildren();
  };
}
