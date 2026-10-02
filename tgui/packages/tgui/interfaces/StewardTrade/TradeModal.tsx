import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import type { Data, TradeQuote } from './types';

export type TradeModalRequest = {
  side: 'import' | 'export';
  regionId: string;
  goodId: string;
};

type TradeModalProps = {
  request: TradeModalRequest | null;
  onClose: () => void;
};

const QUOTE_DEBOUNCE_MS = 120;
let quoteSequence = 0;
const nextQuoteId = () => `${Date.now()}-${++quoteSequence}`;

const computeFillTarget = (quote: TradeQuote | null): number => {
  if (!quote?.ok) return 0;
  const isImport = quote.side === 'import';
  const bulkCap = isImport
    ? quote.max_units
    : Math.min(quote.max_units, quote.stockpile_amount);
  let target = Math.min(quote.batch_capacity, bulkCap);
  if (isImport && quote.base_unit_price > 0) {
    target = Math.min(
      target,
      Math.floor(quote.balance / quote.base_unit_price),
    );
    if (quote.is_alderman_acting && quote.warrant_remaining >= 0) {
      target = Math.min(
        target,
        Math.floor(quote.warrant_remaining / quote.base_unit_price),
      );
    }
  }
  return Math.max(0, Math.floor(target));
};

export const TradeModal = ({ request, onClose }: TradeModalProps) =>
  request ? (
    <TradeDialog
      key={`${request.side}:${request.regionId}:${request.goodId}`}
      request={request}
      onClose={onClose}
    />
  ) : null;

const TradeDialog = ({
  request,
  onClose,
}: {
  request: TradeModalRequest;
  onClose: () => void;
}) => {
  const { act, data } = useBackend<Data>();
  const [draft, setDraft] = useState(() => ({ text: '1', id: nextQuoteId() }));
  const [lastResponse, setLastResponse] = useState<TradeQuote | null>(null);
  const autoFilledRef = useRef(false);
  const closedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isImport = request.side === 'import';
  const sideLabel = isImport ? 'Import' : 'Export';
  const quantity = Number(draft.text);
  const wholeQuantity =
    draft.text.trim() !== '' && Number.isSafeInteger(quantity);
  const matches = (candidate: TradeQuote | null | undefined) =>
    candidate?.request_id === draft.id &&
    candidate.side === request.side &&
    candidate.region_id === request.regionId &&
    candidate.good_id === request.goodId &&
    (!candidate.ok || candidate.quantity === quantity);
  // A late response cannot replace an accepted quote for the current draft.
  const response = matches(data.trade_quote)
    ? data.trade_quote
    : matches(lastResponse)
      ? lastResponse
      : null;
  const quote = response?.ok ? response : null;
  const details = quote ?? (lastResponse?.ok ? lastResponse : null);
  const bulkMax = details?.max_units ?? 50;
  const stockpile = details?.stockpile_amount ?? 0;
  const maxUnits =
    isImport || !details ? bulkMax : Math.min(bulkMax, stockpile);
  const validQuantity = wholeQuantity && quantity >= 1 && quantity <= maxUnits;
  const sequestered = !!data.sequestration?.active;
  const fillTarget = computeFillTarget(details);
  const canFill = fillTarget >= 1 && !sequestered;
  const atFill = quantity === fillTarget;
  const batchCapacity = details?.batch_capacity ?? 0;
  const escalation = quote?.escalation_subtotal ?? 0;
  const blockaded = !!details?.is_blockaded;

  const updateQuantity = (text: string) => {
    autoFilledRef.current = true;
    setDraft({ text, id: nextQuoteId() });
  };

  useEffect(() => {
    if (sequestered) {
      setDraft((current) => ({ text: current.text, id: nextQuoteId() }));
    }
  }, [sequestered]);

  useEffect(() => {
    if (response && response !== lastResponse) setLastResponse(response);
    if (!isImport && quote && !autoFilledRef.current) {
      autoFilledRef.current = true;
      const target = computeFillTarget(quote);
      if (target >= 1 && target !== quantity) {
        setDraft({ text: String(target), id: nextQuoteId() });
      }
    }
  }, [response, lastResponse, quote, isImport, quantity]);

  useEffect(() => {
    if (!validQuantity || sequestered) return;
    const timer = window.setTimeout(() => {
      if (closedRef.current) return;
      act('trade_quote', {
        side: request.side,
        region_id: request.regionId,
        good_id: request.goodId,
        quantity,
        request_id: draft.id,
      });
    }, QUOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    request.side,
    request.regionId,
    request.goodId,
    draft.id,
    quantity,
    validQuantity,
    sequestered,
    act,
  ]);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    act('trade_quote_close');
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current!;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ),
      );
    if (inputRef.current && !inputRef.current.disabled) {
      inputRef.current.focus();
      inputRef.current.select();
    } else {
      (focusable()[0] ?? dialog).focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) {
        (focusable()[0] ?? dialog).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const issue = sequestered
    ? 'Commerce is in sequestration. This trade cannot be placed.'
    : !validQuantity
      ? maxUnits < 1
        ? 'Nothing in the stockpile to sell.'
        : `Enter a whole quantity from 1 to ${maxUnits}.`
      : !response
        ? 'Calculating current quote…'
        : !response.ok
          ? response.reason || 'This trade is unavailable.'
          : isImport && !response.can_afford
            ? 'Treasury cannot cover this trade.'
            : !response.warrant_ok
              ? 'Warrant cannot cover this trade.'
              : '';
  const submitDisabled = !!issue;
  const confirm = () => {
    if (submitDisabled || closedRef.current) return;
    closedRef.current = true;
    act(isImport ? 'trade_import' : 'trade_export', {
      region_id: request.regionId,
      good_id: request.goodId,
      quantity,
    });
    onClose();
  };
  const change = (delta: number) => {
    const current = wholeQuantity ? quantity : 1;
    let next = current + delta;
    if (
      canFill &&
      ((delta > 0 && current < fillTarget && next > fillTarget) ||
        (delta < 0 && current > fillTarget && next < fillTarget))
    ) {
      next = fillTarget;
    }
    updateQuantity(String(Math.max(1, Math.min(maxUnits, next))));
  };
  const fillTooltip = !details
    ? 'Waiting for the current quote.'
    : batchCapacity < 1
      ? 'No capacity left today.'
      : !canFill
        ? sequestered
          ? 'Commerce is in sequestration.'
          : isImport
            ? 'The purse or warrant cannot cover a single unit.'
            : 'Nothing in the stockpile to sell.'
        : `Set quantity to ${fillTarget}, the most you can ${isImport ? 'buy' : 'sell'} before saturation.`;

  return (
    <div className="StewardTradeModal__overlay" onClick={close}>
      <div
        className="StewardTradeModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="steward-trade-title"
        aria-describedby="steward-trade-route"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="StewardTradeModal__header">
          <h2 id="steward-trade-title">
            {sideLabel}{' '}
            {details?.good_name ??
              data.good_catalog?.[request.goodId]?.name ??
              request.goodId}
          </h2>
          <p id="steward-trade-route">
            {isImport ? 'from' : 'to'}{' '}
            {details?.region_name ??
              data.region_catalog?.[request.regionId]?.name ??
              request.regionId}
            {blockaded && (
              <strong className="StewardTradeModal__warning">
                {' '}
                · Blockaded
              </strong>
            )}
          </p>
        </header>
        <div
          className="StewardTradeModal__body"
          role="region"
          aria-label="Shipment quantity and account"
          tabIndex={0}
        >
          <div className="StewardTradeModal__quantity">
            <label htmlFor="steward-trade-quantity">Quantity</label>
            <div className="StewardTradeModal__stepper">
              <button
                type="button"
                aria-label="Decrease quantity by ten"
                disabled={sequestered || maxUnits < 1 || quantity <= 1}
                onClick={() => change(-10)}
              >
                −10
              </button>
              <button
                type="button"
                aria-label="Decrease quantity by one"
                disabled={sequestered || maxUnits < 1 || quantity <= 1}
                onClick={() => change(-1)}
              >
                −
              </button>
              <input
                ref={inputRef}
                id="steward-trade-quantity"
                type="number"
                min={1}
                max={maxUnits}
                step={1}
                value={draft.text}
                disabled={sequestered}
                aria-invalid={!validQuantity}
                aria-describedby="steward-trade-limits steward-trade-status"
                onChange={(event) => updateQuantity(event.target.value)}
              />
              <button
                type="button"
                aria-label="Increase quantity by one"
                disabled={sequestered || maxUnits < 1 || quantity >= maxUnits}
                onClick={() => change(1)}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Increase quantity by ten"
                disabled={sequestered || maxUnits < 1 || quantity >= maxUnits}
                onClick={() => change(10)}
              >
                +10
              </button>
              <button
                type="button"
                disabled={!canFill || atFill}
                title={fillTooltip}
                aria-label={
                  canFill
                    ? `Fill to ${fillTarget} units before saturation`
                    : 'Fill before saturation'
                }
                onClick={() => updateQuantity(String(fillTarget))}
              >
                Fill {canFill ? fillTarget : '—'}
              </button>
            </div>
          </div>
          <p className="StewardTradeModal__note" id="steward-trade-limits">
            Stockpile: {details ? `${stockpile} units` : '…'} · Max {maxUnits}{' '}
            per trade
            {!isImport && details && stockpile < bulkMax
              ? ' (limited by stockpile)'
              : ''}
          </p>
          <p className="StewardTradeModal__capacity">
            {details
              ? isImport
                ? `${batchCapacity} units at base price in one shipment. Buying past that drives the price up the more you take.`
                : `${batchCapacity} units of demand left in one shipment. Selling past that floods the market and the price drops.`
              : 'Waiting for regional prices and shipment capacity.'}
          </p>
          <dl
            className="StewardTradeModal__account"
            aria-busy={!response && validQuantity && !sequestered}
          >
            <div>
              <dt>
                {isImport ? 'Region output today' : 'Region appetite today'}
              </dt>
              <dd>
                {details
                  ? `${details.capacity_today} / ${details.capacity_total} units`
                  : '…'}
              </dd>
            </div>
            <div>
              <dt>Units at base price</dt>
              <dd>
                {quote
                  ? `${Math.min(quantity, batchCapacity)} / ${quantity}`
                  : '…'}
              </dd>
            </div>
            <div>
              <dt>Units past saturation</dt>
              <dd>{quote ? Math.max(0, quantity - batchCapacity) : '…'}</dd>
            </div>
            <div>
              <dt>Base unit price</dt>
              <dd>{quote ? `${quote.base_unit_price}m / unit` : '…'}</dd>
            </div>
            <div>
              <dt>Base subtotal</dt>
              <dd>{quote ? `${quote.base_subtotal}m` : '…'}</dd>
            </div>
            {escalation > 0 && (
              <div className="StewardTradeModal__warning">
                <dt>
                  {isImport
                    ? 'Escalation surcharge'
                    : 'Revenue lost to oversupply'}
                </dt>
                <dd>
                  {isImport ? '+' : '−'}
                  {escalation}m
                </dd>
              </div>
            )}
            <div className="StewardTradeModal__total">
              <dt>{isImport ? 'Total cost' : 'Total revenue'}</dt>
              <dd>{quote ? `${quote.total}m` : '…'}</dd>
            </div>
            <div>
              <dt>Crown&apos;s Purse after</dt>
              <dd>{quote ? `${quote.balance_after}m` : '…'}</dd>
            </div>
            <div>
              <dt>Stockpile after</dt>
              <dd>{quote ? `${quote.stockpile_after} units` : '…'}</dd>
            </div>
            {details?.is_alderman_acting && details.warrant_remaining >= 0 ? (
              <div>
                <dt>Warrant remaining</dt>
                <dd>{quote ? `${quote.warrant_remaining}m` : '…'}</dd>
              </div>
            ) : null}
          </dl>
          {blockaded && (
            <p className="StewardTradeModal__warning">
              This route is blockaded.{' '}
              {isImport ? 'Cost is doubled.' : 'Revenue is halved.'}
            </p>
          )}
        </div>
        <footer className="StewardTradeModal__footer">
          <p id="steward-trade-status" role="status">
            {issue || 'Quote ready.'}
          </p>
          <div>
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="StewardTradeModal__confirm"
              disabled={submitDisabled}
              title={issue}
              onClick={confirm}
            >
              Confirm {sideLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
