import type { TradeQuote } from './types';

export type TradeModalRequest = {
  side: 'import' | 'export';
  regionId: string;
  goodId: string;
};

export const computeFillTarget = (quote: TradeQuote | null): number => {
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

type TradeQuoteStateInput = {
  request: TradeModalRequest;
  draft: { text: string; id: string };
  serverResponse: TradeQuote | null | undefined;
  lastResponse: TradeQuote | null;
  sequestered: boolean;
};

export const deriveTradeQuoteState = ({
  request,
  draft,
  serverResponse,
  lastResponse,
  sequestered,
}: TradeQuoteStateInput) => {
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
  const response = matches(serverResponse)
    ? serverResponse
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
  const fillTarget = computeFillTarget(details);
  const canFill = fillTarget >= 1 && !sequestered;
  const atFill = quantity === fillTarget;
  const batchCapacity = details?.batch_capacity ?? 0;
  const escalation = quote?.escalation_subtotal ?? 0;
  const blockaded = !!details?.is_blockaded;

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

  return {
    isImport,
    sideLabel,
    quantity,
    wholeQuantity,
    response,
    quote,
    details,
    bulkMax,
    stockpile,
    maxUnits,
    validQuantity,
    fillTarget,
    canFill,
    atFill,
    batchCapacity,
    escalation,
    blockaded,
    issue,
    submitDisabled,
    fillTooltip,
  };
};
