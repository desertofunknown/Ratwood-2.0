import { useId, useMemo, useState } from 'react';

import type { MarketData, NoticeboardData, RealmDemandRow } from '../types';

const FILL_YELLOW = 0.5;
const FILL_RED = 0.85;
const DEMAND_WARM = 1.001;
const TOP_N = 5;

const fillTone = (fill: number, refused: boolean): string => {
  if (refused || fill >= FILL_RED) return 'bad';
  if (fill >= FILL_YELLOW) return 'warm';
  return 'good';
};

const demandTone = (mult: number): string => {
  if (mult >= 1.35) return 'bad';
  if (mult >= 1.15) return 'warm';
  if (mult > DEMAND_WARM) return 'accent';
  if (mult < 1) return 'cool';
  return 'muted';
};

const RealmDemandMatrix = ({
  realms,
  allBuckets,
}: {
  realms: RealmDemandRow[];
  allBuckets: string[];
}) => {
  if (realms.length === 0 || allBuckets.length === 0) {
    return (
      <p className="MarketRegister__muted">
        The factors have no realm intelligence to share.
      </p>
    );
  }
  const realmDemandSets = realms.map((realm) => ({
    realm,
    demanded: new Set(realm.demanded),
  }));
  return (
    <>
      <p className="MarketRegister__muted">
        A summary of what each foreign realm demands. Hail a ship from a realm
        to raise the demand for its categories at the Navigator. Valuables and
        Seafood keep their full price even with no ship in port; every other
        category pays only half until a buyer arrives.
      </p>
      <div
        className="MarketRegister__matrixScroll"
        role="region"
        aria-label="Realm demand matrix"
        tabIndex={0}
      >
        <table className="MarketRegister__matrix" aria-label="Realm demand">
          <thead>
            <tr>
              <th scope="col">Category</th>
              {realmDemandSets.map(({ realm }) => (
                <th key={realm.realm_id} scope="col">
                  {realm.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allBuckets.map((bucket) => (
              <tr key={bucket}>
                <th scope="row">{bucket}</th>
                {realmDemandSets.map(({ realm, demanded }) => (
                  <td key={realm.realm_id}>
                    <span
                      className={`MarketRegister__${demanded.has(bucket) ? 'good' : 'muted'}`}
                    >
                      {demanded.has(bucket) ? 'Demanded' : 'No demand'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const MarketView = ({
  market,
  headerLabel,
  headerNote,
}: {
  market: MarketData | null | undefined;
  headerLabel?: string;
  headerNote?: string;
}) => {
  const categories = market?.categories;
  const { sorted, hot, filling } = useMemo(() => {
    const entries = categories ?? [];
    return {
      sorted: entries
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category)),
      hot: new Set(
        entries
          .filter((category) => category.demand_mult > DEMAND_WARM)
          .sort((a, b) => b.demand_mult - a.demand_mult)
          .slice(0, TOP_N)
          .map((category) => category.category),
      ),
      filling: new Set(
        entries
          .filter(
            (category) =>
              category.refused || category.fill_ratio >= FILL_YELLOW,
          )
          .sort((a, b) => b.fill_ratio - a.fill_ratio)
          .slice(0, TOP_N)
          .map((category) => category.category),
      ),
    };
  }, [categories]);
  const [loreOpen, setLoreOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const id = useId();

  if (!market || sorted.length === 0) {
    return (
      <div className="MarketRegister">
        <p className="MarketRegister__muted">
          The factors have nothing to report just yet.
        </p>
      </div>
    );
  }

  return (
    <section className="MarketRegister" aria-labelledby={`${id}-heading`}>
      <header className="MarketRegister__header">
        <h2 id={`${id}-heading`}>{headerLabel ?? 'State of the Markets'}</h2>
        {market.theme_dispatch && (
          <p className="MarketRegister__dispatch">{market.theme_dispatch}</p>
        )}
        {headerNote && <p className="MarketRegister__muted">{headerNote}</p>}
      </header>
      <div className="MarketRegister__disclosures">
        <button
          type="button"
          aria-expanded={loreOpen}
          aria-controls={`${id}-notes`}
          onClick={() => setLoreOpen(!loreOpen)}
        >
          {loreOpen ? 'Hide market notes' : 'How the markets work'}
        </button>
        <button
          type="button"
          aria-expanded={matrixOpen}
          aria-controls={`${id}-matrix`}
          onClick={() => setMatrixOpen(!matrixOpen)}
        >
          {matrixOpen
            ? 'Hide realms demand matrix'
            : 'Show realms demand matrix'}
        </button>
      </div>
      <div
        id={`${id}-notes`}
        hidden={!loreOpen}
        className="MarketRegister__notes"
      >
        {loreOpen && (
          <>
            <p>
              Wares lifted from the Navigator pass into the warehouses of the
              Ferentian Trading Company, sorted by category. Each week the
              factors weigh which goods are scarce and which lie in glut, and
              the Navigator&apos;s payouts shift accordingly.
            </p>
            <p>
              <b className="MarketRegister__good">Saturation</b> tracks the
              warehouse stockpile. While there is room, goods sell at face
              value. When the warehouse fills, the market refuses further
              intake.
            </p>
            <p>
              <b className="MarketRegister__accent">Demand</b> spikes when
              foreign vessels make port. Their captains pay above market for
              what they want. When the ship sails, the demand sails with it.
            </p>
            <p>
              <b>Hailing a ship</b> raises its demand and draws inventory from
              the warehouse, opening room for more sales while the ship is in
              port.
            </p>
            <p>
              A <b className="MarketRegister__accent">Black Market</b> runs in
              the shadows. It holds half the capacity of the legitimate
              warehouse, takes no demand boost from foreign ships, and its
              prices are independent of the regular market. Each day, smugglers
              and small boats quietly drain its stock, opening room over time.
            </p>
          </>
        )}
      </div>
      <div
        id={`${id}-matrix`}
        hidden={!matrixOpen}
        className="MarketRegister__notes"
      >
        {matrixOpen && (
          <RealmDemandMatrix
            realms={market.realm_demand_matrix ?? []}
            allBuckets={market.all_buckets ?? []}
          />
        )}
      </div>
      <table className="MarketRegister__ledger">
        <caption>The Full Ledger</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Consumed</th>
            <th scope="col">Capacity</th>
            <th scope="col">Demand</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((category) => (
            <tr key={category.category}>
              <th scope="row">{category.category}</th>
              <td
                className={`MarketRegister__${fillTone(category.fill_ratio, category.refused)}`}
              >
                {category.consumed}m
              </td>
              <td>{category.capacity}m</td>
              <td
                className={`MarketRegister__${demandTone(category.demand_mult)}`}
              >
                {category.demand_mult.toFixed(2)}x
              </td>
              <td className="MarketRegister__status">
                {hot.has(category.category) && (
                  <span className="MarketRegister__bad">Hot</span>
                )}
                {category.refused ? (
                  <span className="MarketRegister__bad">Refusing (full)</span>
                ) : filling.has(category.category) ? (
                  <span
                    className={`MarketRegister__${fillTone(category.fill_ratio, false)}`}
                  >
                    Filling Up {Math.round(category.fill_ratio * 100)}%
                  </span>
                ) : null}
                {!hot.has(category.category) &&
                  !filling.has(category.category) &&
                  !category.refused && (
                    <span className="MarketRegister__muted">-</span>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="MarketRegister__key">
        Hot: buyers hunger for these. Filling Up: warehouses nearing capacity.
        Each marks up to five categories.
      </p>
      {hot.size === 0 && (
        <p className="MarketRegister__muted">
          No category is in special demand right now.
        </p>
      )}
      {filling.size === 0 && (
        <p className="MarketRegister__muted">
          No warehouse near capacity. Plenty of room to sell.
        </p>
      )}
    </section>
  );
};

export const MarketSection = ({ data }: { data: NoticeboardData }) => (
  <MarketView market={data.market_data} />
);
