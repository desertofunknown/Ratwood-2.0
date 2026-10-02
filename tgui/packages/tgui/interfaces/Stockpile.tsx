import { useState } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../backend';
import { Window } from '../layouts';

type StockRow = {
  ref: string;
  name: string;
  desc: string;
  category: string;
  amount: number;
  limit: number;
  withdraw_price: number;
  deposit_price: number;
  export_price: number;
  import_price: number;
  withdraw_disabled: BooleanLike;
  accept_enabled: BooleanLike;
  event_tag: string;
  shortage_progress: number;
  shortage_target: number;
  shortage_affected: string;
};

type Bounty = {
  name: string;
  payout_price: number;
  percent: BooleanLike;
};

type Data = {
  budget: number;
  compact: BooleanLike;
  categories: string[];
  category: string;
  food_stipend: BooleanLike;
  fiscal_authority: BooleanLike;
  treasury_floor: number;
  below_floor: BooleanLike;
  charter_unlocked: BooleanLike;
  charter_active: BooleanLike;
  charter_margin: number;
  charter_volume: number;
  charter_threshold: number;
  stocks: StockRow[];
  bounties: Bounty[];
  no_deposit: BooleanLike;
  title: string;
  subtitle: string;
  community_progress: number;
  community_target: number;
  community_points: number;
  community_visible: BooleanLike;
};

type ActFn = (action: string, params?: Record<string, unknown>) => void;

const CONDITIONS_KEY = '__conditions__';

const StockRowView = (props: {
  row: StockRow;
  data: Data;
  act: ActFn;
  compact: boolean;
}) => {
  const { row, data, act, compact } = props;
  const noDeposit = !!data.no_deposit;
  const stipendCovers =
    !!data.food_stipend &&
    ['Fruit', 'Vegetable', 'Animal', 'Seafood'].includes(row.category);
  const embargoed = !!row.withdraw_disabled && !data.fiscal_authority;
  const overriding = !!row.withdraw_disabled && !!data.fiscal_authority;
  const withdrawReason = embargoed
    ? 'Closed to the public'
    : row.amount <= 0
      ? 'Out of stock'
      : row.withdraw_price > data.budget && !stipendCovers
        ? 'Insert more mammons'
        : '';
  const importReason = embargoed
    ? 'Closed to the public'
    : row.import_price <= 0
      ? 'No regional supply'
      : row.import_price > data.budget
        ? 'Insert more mammons'
        : '';
  const shortage = row.event_tag === 'SHORTAGE' && row.shortage_target > 0;

  return (
    <div className={`Stockpile__row ${compact ? 'Stockpile__row--compact' : ''}`}>
      <div className="Stockpile__product">
        <div className="Stockpile__productName">{row.name}</div>
        <div className="Stockpile__conditions">
          {!!row.event_tag && (
            <span
              className={`Stockpile__badge Stockpile__badge--${row.event_tag === 'GLUT' ? 'good' : 'warning'}`}
              title={shortage
                ? `Export or sell ${Math.max(0, row.shortage_target - row.shortage_progress)} more units to end the shortage. These goods count: ${row.shortage_affected}.`
                : undefined}
            >
              {row.event_tag}
              {shortage && ` ${row.shortage_progress}/${row.shortage_target}`}
            </span>
          )}
          {!!row.withdraw_disabled && (
            <span className="Stockpile__badge Stockpile__badge--warning">
              {overriding ? 'Fiscal override' : 'Embargoed'}
            </span>
          )}
          {!row.accept_enabled && !noDeposit && (
            <span className="Stockpile__badge">Deposits closed</span>
          )}
          {stipendCovers && (
            <span className="Stockpile__badge Stockpile__badge--good">Food stipend</span>
          )}
        </div>
        {!compact && row.desc && <p className="Stockpile__description">{row.desc}</p>}
        {!compact && shortage && (
          <p className="Stockpile__description">
            Sell or export {Math.max(0, row.shortage_target - row.shortage_progress)} more units.
            {' '}Eligible: {row.shortage_affected}.
          </p>
        )}
      </div>
      <div className="Stockpile__stock" title={`${row.amount} units stored; capacity ${row.limit}`}>
        <strong>{row.amount}</strong><span> / {row.limit}</span>
      </div>
      {!noDeposit && (
        <div className="Stockpile__sale" title={row.export_price > 0
          ? `Deposit payout: ${row.deposit_price}m per unit. When full, eligible deposits are exported; the Crown keeps ${row.export_price}m per unit.`
          : 'Deposit matching goods at the machine to sell them.'}>
          <strong>{row.deposit_price}m</strong>
          {!row.accept_enabled && <span>Closed</span>}
        </div>
      )}
      <div className="Stockpile__purchase">
        <button
          type="button"
          disabled={!!withdrawReason}
          onClick={() => act('withdraw', { ref: row.ref })}
          aria-label={`${stipendCovers ? 'Use food stipend for' : 'Buy'} one ${row.name}${stipendCovers ? '' : ` for ${row.withdraw_price} mammons`}`}
          title={withdrawReason || (overriding
            ? 'Withdraw one unit using your fiscal authority.'
            : stipendCovers ? 'Withdraw one unit using your food stipend.' : 'Buy one unit from the local stockpile.')}
        >
          {stipendCovers ? 'Stipend' : `${row.withdraw_price}m`}
        </button>
        {!!withdrawReason && <span className="Stockpile__unavailable">{withdrawReason}</span>}
      </div>
      <div className="Stockpile__purchase">
        <button
          type="button"
          disabled={!!importReason}
          onClick={() => act('direct_import', { ref: row.ref })}
          aria-label={row.import_price > 0 ? `Import one ${row.name} for ${row.import_price} mammons` : `No regional supply of ${row.name}`}
          title={importReason || (data.charter_active
            ? 'Import one unit; the price includes duty to the Crown.'
            : 'Import one unit; the price includes transport.')}
        >
          {row.import_price > 0 ? `${row.import_price}m` : 'No supply'}
        </button>
        {!!importReason && <span className="Stockpile__unavailable">{importReason}</span>}
      </div>
    </div>
  );
};

export const Stockpile = () => {
  const { act, data } = useBackend<Data>();
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const category = data.category;
  const compact = !!data.compact;
  const noDeposit = !!data.no_deposit;
  const conditionsCount = data.stocks.filter((row) => !!row.event_tag).length;
  const isConditionsTab = category === CONDITIONS_KEY;
  const query = search.trim().toLowerCase();
  const filtered = data.stocks.filter((row) =>
    (query
      ? `${row.name} ${row.desc} ${row.category}`.toLowerCase().includes(query)
      : isConditionsTab ? !!row.event_tag : row.category === category),
  );
  const selectCategory = (value: string) => {
    setSearch('');
    act('set_category', { category: value });
  };

  return (
    <Window width={900} height={740}>
      <Window.Content>
        <div className={`Stockpile ${noDeposit ? 'Stockpile--withdraw' : ''}`}>
          <header className="Stockpile__header">
            <h1>{data.title || 'Town Stockpile'}</h1>
            <div className="Stockpile__funds">
              <span>Loaded</span>
              <strong>{data.budget}<small>m</small></strong>
              <button type="button" disabled={data.budget <= 0} onClick={() => act('refund_budget')}>
                Return coins
              </button>
            </div>
            <button type="button" aria-expanded={showHelp} aria-controls="stockpile-help"
              onClick={() => setShowHelp(!showHelp)}>Help</button>
          </header>
          {showHelp && (
            <div className="Stockpile__help" id="stockpile-help">
              <p>{data.subtitle || 'Insert mammons to buy or import supplies.'}</p>
              <p>{noDeposit ? 'Buying only. Take goods to a stockpile to sell them.' : 'To sell, use goods on the machine. Right-click it to load nearby goods.'}</p>
              <p>Select a price to buy one unit. Imports include transport or Crown duty. Details shows descriptions and shortage requirements.</p>
            </div>
          )}
          <div className="Stockpile__ledgerStatus">
            <span className={`Stockpile__badge ${data.charter_unlocked ? data.charter_active ? 'Stockpile__badge--good' : 'Stockpile__badge--warning' : ''}`}>
              {data.charter_unlocked
                ? `Royal Custom ${data.charter_active ? 'active' : 'suspended'} · ${data.charter_margin}%`
                : `Charter trade · ${data.charter_volume}/${data.charter_threshold}m`}
            </span>
            {!!data.food_stipend && <span className="Stockpile__badge Stockpile__badge--good">Food stipend available</span>}
            {!!data.below_floor && (
              <span className="Stockpile__badge Stockpile__badge--warning" title={`The Crown's funds are below the ${data.treasury_floor}m purchase floor.`}>
                Treasury below purchase floor
              </span>
            )}
            {!!data.community_visible && (
              <span className="Stockpile__badge Stockpile__badge--good" title={`Every ${data.community_target} deposited units earns community status toward your next dream's sleep points.`}>
                Community · {data.community_progress}/{data.community_target}
                {data.community_points > 0 && ` · Status ${data.community_points}`}
              </span>
            )}
          </div>
          <div className="Stockpile__body">
            <nav className="Stockpile__categories" aria-label="Goods categories">
              <button type="button" aria-pressed={!query && isConditionsTab}
                onClick={() => selectCategory(CONDITIONS_KEY)}>
                <span>Conditions</span><small>{conditionsCount}</small>
              </button>
              {data.categories.map((name) => (
                <button type="button" key={name} aria-pressed={!query && name === category}
                  onClick={() => selectCategory(name)}>
                  <span>{name}</span><small>{data.stocks.filter((row) => row.category === name).length}</small>
                </button>
              ))}
            </nav>
            <main className="Stockpile__goods">
              <div className="Stockpile__toolbar">
                <h2>{query ? 'Search' : isConditionsTab ? 'Conditions' : category}<small> ({filtered.length})</small></h2>
                <input aria-label="Search all goods" placeholder="Search all goods…" value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)} />
                {!!search && <button type="button" onClick={() => setSearch('')}>Clear</button>}
                <button type="button" aria-pressed={!compact} onClick={() => act('toggle_compact')}>
                  Details
                </button>
              </div>
              <div className="Stockpile__columns" aria-hidden="true">
                <span>Goods</span><span>Stored / cap.</span>
                {!noDeposit && <span>Sell / unit</span>}
                <span>Buy local / unit</span><span>Import / unit</span>
              </div>
              <div className="Stockpile__scroll" tabIndex={0} aria-label="Available goods">
                {filtered.length === 0 ? (
                  <div className="Stockpile__empty">
                    <strong>{query ? 'No matching goods' : isConditionsTab ? 'No market conditions' : 'No goods in this category'}</strong>
                    <p>{query ? 'Try another name or clear your search.' : isConditionsTab ? 'No shortages or gluts are currently reported.' : 'Choose another category to browse available supplies.'}</p>
                  </div>
                ) : filtered.map((row) => (
                  <StockRowView key={row.ref} row={row} data={data} act={act} compact={compact} />
                ))}
                {!noDeposit && data.bounties.length > 0 && (
                  <section className="Stockpile__bounties">
                    <h2>Standing bounties</h2>
                    {data.bounties.map((bounty) => (
                      <div key={bounty.name}><span>{bounty.name}</span>
                        <strong>{bounty.payout_price}{bounty.percent ? '%' : 'm'}</strong>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            </main>
          </div>
        </div>
      </Window.Content>
    </Window>
  );
};
