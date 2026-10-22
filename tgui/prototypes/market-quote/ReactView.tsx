import React, { useEffect, useRef } from 'react';

import type { MarketRegionOption } from '../../packages/tgui/interfaces/StewardTrade/types';
import type { createMarketController } from './model';

type Controller = ReturnType<typeof createMarketController>;
type Snapshot = ReturnType<Controller['snapshot']>;
type Props = { state: Snapshot; controller: Controller };

export function ReactView({ state, controller }: Props) {
  const { data, activeGroup, request, draft, quoteState: q } = state;
  const input = useRef<HTMLInputElement>(null);
  const initiatingControl = useRef<HTMLButtonElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (request) {
      (input.current?.disabled ? back.current : input.current)?.focus();
    }
  }, [request]);
  const close = () => {
    controller.closeQuote();
    if (initiatingControl.current?.isConnected)
      initiatingControl.current.focus();
  };
  const region = (
    option: MarketRegionOption,
    side: 'import' | 'export',
    goodId: string,
  ) => {
    const regionName =
      data.region_catalog[option.region_id]?.name ?? option.region_id;
    const goodName = data.good_catalog[goodId]?.name ?? goodId;
    return (
      <div className="MarketQuote__region" key={`${side}:${option.region_id}`}>
        <span>{regionName}</span>
        <strong>{option.unit_price}m / unit</strong>
        <span>
          {option.capacity_today} / {option.capacity_total} today ·{' '}
          {option.batch_capacity} per shipment
        </span>
        {!!option.is_blockaded && (
          <strong className="MarketQuote__issue">Blockaded</strong>
        )}
        {option.capacity_today <= 0 && (
          <span className="MarketQuote__notice">Saturated</span>
        )}
        <button
          className="TithewoodControl"
          type="button"
          data-market-region={option.region_id}
          data-market-side={side}
          data-market-route-good={goodId}
          aria-label={`Inspect ${side} ${goodName} ${side === 'import' ? 'from' : 'to'} ${regionName}`}
          onClick={(event) => {
            initiatingControl.current = event.currentTarget;
            controller.openQuote({ side, regionId: option.region_id, goodId });
          }}
        >
          Inspect {side === 'import' ? 'import' : 'export'}
        </button>
      </div>
    );
  };
  return (
    <section
      className="MarketQuote TithewoodSurface"
      aria-label="Market quote preview"
    >
      <header className="MarketQuote__header">
        <div>
          <h2>Market</h2>
          <p>Read-only shipment quote inspector</p>
        </div>
        <p>
          Day {data.day} · Crown&apos;s Purse <strong>{data.treasury}m</strong>
        </p>
      </header>
      <div className="MarketQuote__body">
        <p className="MarketQuote__notice">
          Disconnected sample. No shipment can be placed. Stockpile management
          and commissions are outside this preview.
        </p>
        {!!data.sequestration.active && (
          <p className="MarketQuote__issue" role="status">
            Commerce is in sequestration. This trade cannot be placed.
          </p>
        )}
        {data.market_rows.length === 0 ? (
          <p className="MarketQuote__notice">No goods accepted at present.</p>
        ) : (
          <>
            <nav className="MarketQuote__tabs" aria-label="Goods categories">
              {state.groups.map((group) => (
                <button
                  key={group.category}
                  className="TithewoodControl"
                  type="button"
                  data-market-category={group.category}
                  aria-pressed={group.category === activeGroup?.category}
                  onClick={() => controller.selectCategory(group.category)}
                >
                  {group.label} ({group.rows.length})
                </button>
              ))}
            </nav>
            <div
              className="MarketQuote__catalog"
              aria-label={activeGroup?.label ?? 'Goods'}
            >
              {activeGroup?.rows.map((row) => {
                const good = data.good_catalog[row.good_id];
                const expanded = state.expanded.includes(row.good_id);
                const hasAlternatives =
                  row.import_regions.length > 1 ||
                  row.export_regions.length > 1;
                return (
                  <article
                    className="MarketQuote__row"
                    key={row.good_id}
                    data-market-good={row.good_id}
                  >
                    <header>
                      <h3>{good?.name ?? row.good_id}</h3>
                      <span>
                        Stock {row.stock} / {row.stock_limit}
                      </span>
                      {row.event_tag && <strong>{row.event_tag}</strong>}
                    </header>
                    <div className="MarketQuote__regions">
                      <div>
                        <h4>Best buy</h4>
                        {row.import_regions[0] ? (
                          region(row.import_regions[0], 'import', row.good_id)
                        ) : (
                          <p>
                            {good?.importable
                              ? 'No producing region'
                              : 'Not importable'}
                          </p>
                        )}
                      </div>
                      <div>
                        <h4>Best sell</h4>
                        {row.export_regions[0] ? (
                          region(row.export_regions[0], 'export', row.good_id)
                        ) : (
                          <p>No demanding region</p>
                        )}
                      </div>
                    </div>
                    {hasAlternatives && (
                      <>
                        <button
                          className="TithewoodControl"
                          type="button"
                          data-market-expand={row.good_id}
                          aria-expanded={expanded}
                          aria-controls={`market-alternatives-${row.good_id}`}
                          onClick={() => controller.toggleExpanded(row.good_id)}
                        >
                          {expanded ? 'Hide' : 'Compare'} other regions
                        </button>
                        <div
                          className="MarketQuote__regions"
                          id={`market-alternatives-${row.good_id}`}
                          hidden={!expanded}
                        >
                          {expanded && (
                            <>
                              <div>
                                <h4>Other buy regions</h4>
                                {row.import_regions.length > 1 ? (
                                  row.import_regions
                                    .slice(1)
                                    .map((option) =>
                                      region(option, 'import', row.good_id),
                                    )
                                ) : (
                                  <p>No other producing region</p>
                                )}
                              </div>
                              <div>
                                <h4>Other sell regions</h4>
                                {row.export_regions.length > 1 ? (
                                  row.export_regions
                                    .slice(1)
                                    .map((option) =>
                                      region(option, 'export', row.good_id),
                                    )
                                ) : (
                                  <p>No other demanding region</p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {request && q && (
          <section
            className="MarketQuote__quote"
            aria-labelledby="market-quote-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
          >
            <header>
              <div>
                <h2 id="market-quote-title">
                  {q.sideLabel}{' '}
                  {data.good_catalog[request.goodId]?.name ?? request.goodId}
                </h2>
                <p>
                  {q.isImport ? 'from' : 'to'}{' '}
                  {data.region_catalog[request.regionId]?.name ??
                    request.regionId}
                </p>
              </div>
              <button
                className="TithewoodControl"
                type="button"
                data-quote-back
                ref={back}
                onClick={close}
              >
                Back to regions
              </button>
            </header>
            <div className="MarketQuote__quantity">
              <label htmlFor="market-quote-quantity">Quantity</label>
              <div>
                {[-10, -1].map((delta) => (
                  <button
                    key={delta}
                    className="TithewoodControl"
                    type="button"
                    aria-label={`Decrease quantity by ${Math.abs(delta)}`}
                    disabled={
                      !!data.sequestration.active ||
                      q.maxUnits < 1 ||
                      q.quantity <= 1
                    }
                    onClick={() => controller.changeQuantity(delta)}
                  >
                    {delta === -1 ? '−' : '−10'}
                  </button>
                ))}
                <input
                  className="TithewoodControl"
                  ref={input}
                  id="market-quote-quantity"
                  data-quote-quantity
                  type="number"
                  min={1}
                  max={q.maxUnits}
                  step={1}
                  value={draft.text}
                  disabled={!!data.sequestration.active}
                  aria-invalid={!q.validQuantity}
                  aria-describedby="market-quote-limits market-quote-status"
                  onChange={(event) =>
                    controller.setQuantity(event.currentTarget.value)
                  }
                />
                {[1, 10].map((delta) => (
                  <button
                    key={delta}
                    className="TithewoodControl"
                    type="button"
                    aria-label={`Increase quantity by ${delta}`}
                    disabled={
                      !!data.sequestration.active ||
                      q.maxUnits < 1 ||
                      q.quantity >= q.maxUnits
                    }
                    onClick={() => controller.changeQuantity(delta)}
                  >
                    +{delta === 1 ? '' : delta}
                  </button>
                ))}
                <button
                  className="TithewoodControl"
                  type="button"
                  data-quote-fill
                  disabled={!q.canFill || q.atFill}
                  title={q.fillTooltip}
                  onClick={() => controller.fillQuantity()}
                >
                  Fill {q.canFill ? q.fillTarget : '—'}
                </button>
              </div>
            </div>
            <p id="market-quote-limits">
              Stockpile: {q.details ? `${q.stockpile} units` : '…'} · Max{' '}
              {q.maxUnits} per trade
              {!q.isImport && q.details && q.stockpile < q.bulkMax
                ? ' (limited by stockpile)'
                : ''}
            </p>
            <p>
              {q.details
                ? q.isImport
                  ? `${q.batchCapacity} units at base price in one shipment. Buying past that drives the price up the more you take.`
                  : `${q.batchCapacity} units of demand left in one shipment. Selling past that floods the market and the price drops.`
                : 'Waiting for regional prices and shipment capacity.'}
            </p>
            {!q.quote && q.details && (
              <p className="MarketQuote__notice">
                Capacity and stock above are from the last accepted response.
                Prices and totals stay hidden until a quote matches this draft.
              </p>
            )}
            <dl
              className="MarketQuote__facts"
              aria-label="Shipment quote account"
            >
              <div>
                <dt>
                  {q.isImport ? 'Region output today' : 'Region appetite today'}
                </dt>
                <dd>
                  {q.details
                    ? `${q.details.capacity_today} / ${q.details.capacity_total} units`
                    : '…'}
                </dd>
              </div>
              <div>
                <dt>Units at base price</dt>
                <dd>
                  {q.quote
                    ? `${Math.min(q.quantity, q.batchCapacity)} / ${q.quantity}`
                    : '…'}
                </dd>
              </div>
              <div>
                <dt>Units past saturation</dt>
                <dd>
                  {q.quote ? Math.max(0, q.quantity - q.batchCapacity) : '…'}
                </dd>
              </div>
              <div>
                <dt>Base unit price</dt>
                <dd>{q.quote ? `${q.quote.base_unit_price}m / unit` : '…'}</dd>
              </div>
              <div>
                <dt>Base subtotal</dt>
                <dd>{q.quote ? `${q.quote.base_subtotal}m` : '…'}</dd>
              </div>
              <div>
                <dt>
                  {q.isImport
                    ? 'Escalation surcharge'
                    : 'Revenue lost to oversupply'}
                </dt>
                <dd>
                  {q.quote ? `${q.isImport ? '+' : '−'}${q.escalation}m` : '…'}
                </dd>
              </div>
              <div className="MarketQuote__total">
                <dt>{q.isImport ? 'Total cost' : 'Total revenue'}</dt>
                <dd>{q.quote ? `${q.quote.total}m` : '…'}</dd>
              </div>
              <div>
                <dt>Crown&apos;s Purse after</dt>
                <dd>{q.quote ? `${q.quote.balance_after}m` : '…'}</dd>
              </div>
              <div>
                <dt>Stockpile after</dt>
                <dd>{q.quote ? `${q.quote.stockpile_after} units` : '…'}</dd>
              </div>
              {!!q.details?.is_alderman_acting &&
                q.details.warrant_remaining >= 0 && (
                  <div>
                    <dt>Warrant remaining</dt>
                    <dd>{q.quote ? `${q.quote.warrant_remaining}m` : '…'}</dd>
                  </div>
                )}
            </dl>
            {q.blockaded && (
              <p className="MarketQuote__issue">
                This route is blockaded.{' '}
                {q.isImport ? 'Cost is doubled.' : 'Revenue is halved.'}
              </p>
            )}
            <footer className="MarketQuote__footer">
              <p
                id="market-quote-status"
                className={
                  q.issue ? 'MarketQuote__issue' : 'MarketQuote__notice'
                }
                role="status"
              >
                {q.issue || 'Current recorded quote ready.'}
              </p>
              {state.deliveryNote && (
                <p className="MarketQuote__notice">{state.deliveryNote}</p>
              )}
              <p className="MarketQuote__notice">
                The live server reprices at confirmation. This recorded sample
                is not a guaranteed price and cannot execute a trade.
              </p>
              <button className="TithewoodControl" type="button" disabled>
                Preview only · no trade
              </button>
            </footer>
          </section>
        )}
      </div>
    </section>
  );
}
