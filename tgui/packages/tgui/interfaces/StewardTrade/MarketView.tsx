import { useState } from 'react';

import { useBackend } from '../../backend';
import { groupByCategory } from './helpers';
import type { Data, MarketRegionOption, MarketRow } from './types';

type Side = 'import' | 'export';

type OnTrade = (req: { side: Side; regionId: string; goodId: string }) => void;

export const MarketView = (props: { data: Data; onTrade: OnTrade }) => {
  const { act } = useBackend<Data>();
  const {
    market_rows,
    good_catalog,
    total_arbitrage_potential,
    autoexport_percentage,
  } = props.data;
  const { onTrade } = props;
  const aldermanActing = !!props.data.is_alderman_acting;
  const aldermanBlockTitle =
    "Reserved to the Steward's office - the Alderman has no say in the Crown's stockpile.";

  const groups = groupByCategory(market_rows, good_catalog);
  const [activeCategory, setActiveCategory] = useState<string>(
    groups[0]?.category ?? '',
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeGroup =
    groups.find((g) => g.category === activeCategory) ?? groups[0];

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="StewardMarket" aria-label="Market">
      <header className="StewardMarket__heading">
        <h2>Market</h2>
        <span>Auto-routed to best region</span>
      </header>
      <div className="StewardMarket__summary">
        <div>
          Crown spread on held stockpile:{' '}
          <strong className="StewardMarket__accent">
            {total_arbitrage_potential}m
          </strong>{' '}
          potential at current prices
        </div>
        <div
          className="StewardMarket__controls"
          role="group"
          aria-label="All stockpile actions"
        >
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('set_autoexport_percentage')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : `Surplus threshold: ${autoexport_percentage}%. Click to change.`
            }
          >
            Threshold {autoexport_percentage}%
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('export_surplus_all')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : "Export every auto-priced entry's stock above the threshold to its best-paying region, capped at remaining daily demand. Manual-priced entries are skipped."
            }
          >
            Export Surplus
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('autoprice_all')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : 'Reset every stockpile entry to automatic pricing (snaps to current market, ratchets engaged).'
            }
          >
            Auto-Price All
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('autolimit_all')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : 'Recompute every stockpile cap from total demand × pop × 2 days.'
            }
          >
            Auto-Limit All
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('multiply_all_buy')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : "Bulk-multiply every buy price (Crown's bid). Flips affected entries to manual."
            }
          >
            Buy ×
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            onClick={() => act('multiply_all_sell')}
            title={
              aldermanActing
                ? aldermanBlockTitle
                : "Bulk-multiply every sell price (Crown's ask). Flips affected entries to manual."
            }
          >
            Sell ×
          </button>
        </div>
      </div>
      {market_rows.length === 0 ? (
        <p className="StewardMarket__empty">No goods accepted at present.</p>
      ) : (
        <>
          <nav
            className="StewardMarket__categories"
            aria-label="Goods categories"
          >
            {groups.map((g) => (
              <button
                key={g.category}
                type="button"
                aria-pressed={g.category === activeGroup?.category}
                onClick={() => setActiveCategory(g.category)}
              >
                {g.label} ({g.rows.length})
              </button>
            ))}
          </nav>
          {activeGroup && (
            <div>
              <div
                className="StewardMarket__controls"
                role="group"
                aria-label={`${activeGroup.label} actions`}
              >
                <strong>{activeGroup.label}:</strong>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('export_surplus_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Export ${activeGroup.label} surplus (stock over threshold) to best-paying regions.`
                  }
                >
                  Export Surplus
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('autoprice_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Reset all ${activeGroup.label} entries to automatic pricing.`
                  }
                >
                  Auto-Price
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('autolimit_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Recompute all ${activeGroup.label} stockpile caps from demand.`
                  }
                >
                  Auto-Limit
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('multiply_category_buy', {
                      category: activeGroup.category,
                      category_label: activeGroup.label,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Bulk-multiply ${activeGroup.label} buy prices. Flips affected entries to manual.`
                  }
                >
                  Buy ×
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('multiply_category_sell', {
                      category: activeGroup.category,
                      category_label: activeGroup.label,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Bulk-multiply ${activeGroup.label} sell prices. Flips affected entries to manual.`
                  }
                >
                  Sell ×
                </button>
              </div>
              <div
                className="StewardMarket__controls"
                role="group"
                aria-label={`${activeGroup.label} permissions`}
              >
                <strong>Permissions:</strong>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('accept_category', { category: activeGroup.category })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Accept deposits for all ${activeGroup.label}.`
                  }
                >
                  Open All
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('reject_category', { category: activeGroup.category })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Reject deposits for all ${activeGroup.label}.`
                  }
                >
                  Close All
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('allow_withdraw_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Allow withdraws for all ${activeGroup.label}.`
                  }
                >
                  Draws On
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('bar_withdraw_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Bar withdraws for all ${activeGroup.label}.`
                  }
                >
                  Draws Off
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('allow_autoexport_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Let the daily sweep ship ${activeGroup.label} surplus abroad.`
                  }
                >
                  Auto-Export On
                </button>
                <button
                  type="button"
                  disabled={aldermanActing}
                  onClick={() =>
                    act('bar_autoexport_category', {
                      category: activeGroup.category,
                    })
                  }
                  title={
                    aldermanActing
                      ? aldermanBlockTitle
                      : `Stop shipping ${activeGroup.label} away over threshold.`
                  }
                >
                  Auto-Export Off
                </button>
              </div>
              <table className="StewardMarket__register">
                <caption className="StewardMarket__srOnly">
                  {activeGroup.label} trade and Crown stockpile register
                </caption>
                <colgroup>
                  <col className="StewardMarket__goodColumn" />
                  <col className="StewardMarket__stockColumn" />
                  <col className="StewardMarket__priceColumn" />
                  <col className="StewardMarket__priceColumn" />
                  <col className="StewardMarket__capColumn" />
                  <col className="StewardMarket__permissionsColumn" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Good</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Crown buy</th>
                    <th scope="col">Crown sell</th>
                    <th scope="col">Cap</th>
                    <th scope="col">Permissions</th>
                  </tr>
                </thead>
                {activeGroup.rows.map((row) => {
                  const good = good_catalog[row.good_id];
                  const name = good?.name ?? row.good_id;
                  return (
                    <tbody key={row.good_id} aria-label={name}>
                      <StockpileRow
                        row={row}
                        name={name}
                        aldermanActing={aldermanActing}
                      />
                      <tr>
                        <td colSpan={6} className="StewardMarket__routesCell">
                          <div className="StewardMarket__routes">
                            <SideBlock
                              side="import"
                              label="Buy"
                              regions={row.import_regions}
                              unavailableLabel={
                                good?.importable
                                  ? 'no producing region'
                                  : 'not importable'
                              }
                              goodId={row.good_id}
                              goodName={name}
                              expanded={expanded.has(`${row.good_id}-import`)}
                              onToggle={() =>
                                toggleExpanded(`${row.good_id}-import`)
                              }
                              onTrade={onTrade}
                            />
                            <SideBlock
                              side="export"
                              label="Sell"
                              regions={row.export_regions}
                              unavailableLabel="no demanding region"
                              goodId={row.good_id}
                              goodName={name}
                              expanded={expanded.has(`${row.good_id}-export`)}
                              onToggle={() =>
                                toggleExpanded(`${row.good_id}-export`)
                              }
                              onTrade={onTrade}
                            />
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const SideBlock = (props: {
  side: Side;
  label: string;
  regions: MarketRegionOption[];
  unavailableLabel: string;
  goodId: string;
  goodName: string;
  expanded: boolean;
  onToggle: () => void;
  onTrade: OnTrade;
}) => {
  const {
    side,
    label,
    regions,
    unavailableLabel,
    goodId,
    goodName,
    expanded,
    onToggle,
    onTrade,
  } = props;
  const best = regions[0];
  const routesId = `steward-market-${goodId}-${side}`;
  return (
    <div
      className="StewardMarket__side"
      role="group"
      aria-label={`${label} ${goodName}`}
    >
      <div className="StewardMarket__routeHeading">
        <strong>{label}:</strong>
        {!best && (
          <span className="StewardMarket__muted">{unavailableLabel}</span>
        )}
        {best && (
          <>
            <RegionRow
              side={side}
              region={best}
              goodId={goodId}
              goodName={goodName}
              onTrade={onTrade}
            />
            {regions.length > 1 ? (
              <button
                type="button"
                className="StewardMarket__disclosure"
                aria-expanded={expanded}
                aria-controls={routesId}
                onClick={onToggle}
                title={expanded ? 'Hide other regions' : 'Show other regions'}
              >
                {expanded ? 'Hide' : 'Other'} regions ({regions.length - 1})
              </button>
            ) : (
              <span className="StewardMarket__muted">(1 region)</span>
            )}
          </>
        )}
      </div>
      {best && regions.length > 1 && (
        <div
          id={routesId}
          hidden={!expanded}
          className="StewardMarket__otherRoutes"
        >
          {expanded &&
            regions
              .slice(1)
              .map((region) => (
                <RegionRow
                  key={region.region_id}
                  side={side}
                  region={region}
                  goodId={goodId}
                  goodName={goodName}
                  onTrade={onTrade}
                />
              ))}
        </div>
      )}
    </div>
  );
};

const RegionRow = (props: {
  side: Side;
  region: MarketRegionOption;
  goodId: string;
  goodName: string;
  onTrade: OnTrade;
}) => {
  const { data } = useBackend<Data>();
  const { side, region, goodId, goodName, onTrade } = props;
  const regionName =
    data.region_catalog[region.region_id]?.name ?? region.region_id;
  const saturated = region.capacity_today <= 0;
  const actionLabel = side === 'import' ? 'Import' : 'Export';
  return (
    <div className="StewardMarket__route">
      <span className="StewardMarket__regionName">{regionName}</span>
      <span className="StewardMarket__accent">@ {region.unit_price}m/u</span>
      {region.capacity_total > 0 && (
        <span
          className="StewardMarket__capacity"
          title={
            side === 'import'
              ? `${region.capacity_today} of ${region.capacity_total} units left today at this price, up to ${region.batch_capacity} per shipment. Buying beyond that increases the price.`
              : `${region.capacity_today} of ${region.capacity_total} units still wanted today at this price, up to ${region.batch_capacity} per shipment. Selling beyond that drops the price.`
          }
        >
          [{region.capacity_today}/{region.capacity_total}]
        </span>
      )}
      {!!region.is_blockaded && (
        <span className="StewardMarket__bad">BLOCKADED</span>
      )}
      {saturated && (
        <span
          className="StewardMarket__muted"
          title="No remaining capacity today - oversupply decay applies."
        >
          SATURATED
        </span>
      )}
      <button
        type="button"
        aria-label={`${actionLabel} ${goodName} ${side === 'import' ? 'from' : 'to'} ${regionName}`}
        onClick={() => onTrade({ side, regionId: region.region_id, goodId })}
      >
        {actionLabel}
      </button>
    </div>
  );
};

const StockpileRow = (props: {
  row: MarketRow;
  name: string;
  aldermanActing: boolean;
}) => {
  const { act } = useBackend<Data>();
  const { row, name, aldermanActing } = props;
  const goodId = row.good_id;
  const isAuto = !!row.automatic_price;
  const limitAuto = !!row.automatic_limit;
  const blockTitle =
    "Reserved to the Steward's office - the Alderman has no say in the Crown's stockpile.";
  return (
    <tr title={aldermanActing ? blockTitle : undefined}>
      <th scope="row" className="StewardMarket__goodName">
        {name}
        {['SHORTAGE', 'GLUT'].includes(row.event_tag) && (
          <span
            className={
              row.event_tag === 'SHORTAGE'
                ? 'StewardMarket__bad'
                : 'StewardMarket__good'
            }
          >
            {' '}
            {row.event_tag}
          </span>
        )}
      </th>
      <td>
        <span className="StewardMarket__stock">
          {row.stock}/{row.stock_limit}
        </span>
        {row.margin_per_unit > 0 && (
          <small className="StewardMarket__margin">
            +{row.margin_per_unit}m/u → {row.arbitrage_potential}m
          </small>
        )}
      </td>
      <td>
        <div className="StewardMarket__values">
          <button
            type="button"
            disabled={aldermanActing}
            aria-label={`Set ${name} buy price`}
            onClick={() => act('set_buy_price', { good_id: goodId })}
          >
            {row.buy_price}m
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            aria-label={`${name} automatic pricing`}
            aria-pressed={isAuto}
            onClick={() => act('toggle_auto_price', { good_id: goodId })}
            title={
              aldermanActing
                ? blockTitle
                : isAuto
                  ? 'Automatic — deposit ratchets up only, withdraw ratchets down only.'
                  : 'Manual — Steward set this price by hand.'
            }
          >
            {isAuto ? 'Auto' : 'Manual'}
          </button>
        </div>
      </td>
      <td>
        <button
          type="button"
          disabled={aldermanActing}
          aria-label={`Set ${name} sell price`}
          onClick={() => act('set_sell_price', { good_id: goodId })}
        >
          {row.sell_price}m
        </button>
      </td>
      <td>
        <div className="StewardMarket__values">
          <button
            type="button"
            disabled={aldermanActing}
            aria-label={`Set ${name} stockpile limit`}
            onClick={() => act('set_stockpile_limit', { good_id: goodId })}
          >
            {row.stock_limit}
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            aria-label={`${name} automatic limit`}
            aria-pressed={limitAuto}
            onClick={() => act('toggle_auto_limit', { good_id: goodId })}
            title={
              aldermanActing
                ? blockTitle
                : limitAuto
                  ? 'Automatic — total demand × pop × 2 days.'
                  : 'Manual — Steward set this cap by hand.'
            }
          >
            {limitAuto ? 'Auto' : 'Manual'}
          </button>
        </div>
      </td>
      <td>
        <div className="StewardMarket__permissions">
          <button
            type="button"
            disabled={aldermanActing}
            aria-pressed={!!row.accepting}
            aria-label={`${name} deposits`}
            onClick={() => act('toggle_stockpile_accept', { good_id: goodId })}
            title={aldermanActing ? blockTitle : 'Accept player deposits.'}
          >
            {row.accepting ? 'Accept' : 'Reject'}
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            aria-pressed={!row.withdraw_disabled}
            aria-label={`${name} withdrawals`}
            onClick={() => act('toggle_withdraw_disabled', { good_id: goodId })}
            title={aldermanActing ? blockTitle : 'Allow player withdraws.'}
          >
            {row.withdraw_disabled ? 'No-W' : 'W-OK'}
          </button>
          <button
            type="button"
            disabled={aldermanActing}
            aria-pressed={!row.autoexport_disabled}
            aria-label={`${name} auto-export`}
            onClick={() =>
              act('toggle_autoexport_disabled', { good_id: goodId })
            }
            title={
              aldermanActing
                ? blockTitle
                : 'Toggle Auto-Export. Having it off means surplus over the cap will not be shipped away and surplus over threshold will not be shipped away.'
            }
          >
            {row.autoexport_disabled ? 'No-X' : 'X-OK'}
          </button>
        </div>
      </td>
    </tr>
  );
};
