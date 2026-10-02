import { type ReactNode, useId, useState } from 'react';

import type {
  ActFn,
  CatalogData,
  CatalogEntry,
  CulturalStockEntry,
  KinshipData,
} from '../types';

type Props = {
  stock: CulturalStockEntry[];
  catalogs?: CatalogData[];
  kinship?: KinshipData;
  budget: number;
  isAgent?: boolean;
  act: ActFn;
};

const ManifestSection = (props: {
  name: string;
  summary: string;
  defaultExpanded: boolean;
  children: ReactNode;
}) => {
  const { name, summary, defaultExpanded, children } = props;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();
  return (
    <section className="GoldfaceCultural__section">
      <h3>
        <button
          type="button"
          className="GoldfaceCultural__disclosure"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          onKeyDown={(event) => {
            if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
            }
          }}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span>{name}</span>
          <small>{summary}</small>
        </button>
      </h3>
      <div id={contentId} hidden={!expanded}>
        {expanded && children}
      </div>
    </section>
  );
};

const StockRow = (props: {
  entry: CulturalStockEntry | CatalogEntry;
  budget: number;
  onBuy: () => void;
}) => {
  const { entry, budget, onBuy } = props;
  const soldOut = entry.qty <= 0;
  const cantAfford = budget < entry.price;
  const isCatalog = 'stock_max' in entry;
  const kinSaving =
    (isCatalog || entry.is_kin) &&
    entry.price_base_pre_kin !== undefined &&
    entry.price_base_pre_kin > entry.price_base
      ? entry.price_base_pre_kin - entry.price_base
      : 0;
  return (
    <tr>
      <th scope="row" className="GoldfaceCultural__name">
        {entry.name}
        {kinSaving > 0 && (
          <small className="GoldfaceCultural__kin">
            Kinship −{kinSaving}m off base
          </small>
        )}
      </th>
      <td className="GoldfaceCultural__quantity">×{entry.pack_qty}</td>
      <td
        className={`GoldfaceCultural__quantity${soldOut ? ' GoldfaceCultural__unavailable' : ''}`}
        title={
          isCatalog
            ? `${entry.qty} of ${entry.stock_max} in stock; restocks to full each day`
            : `${entry.qty} in stock`
        }
      >
        {entry.qty}
        {isCatalog && ` / ${entry.stock_max}`}
      </td>
      <td
        className="GoldfaceCultural__price"
        title={!isCatalog ? `Regular base ${entry.base_cost}m` : undefined}
      >
        <strong
          className={cantAfford ? 'GoldfaceCultural__unavailable' : undefined}
        >
          {entry.price}m
        </strong>
        <small>
          {entry.price_base}m + {entry.price_tariff}m duty
        </small>
      </td>
      <td className="GoldfaceCultural__action">
        <button
          type="button"
          disabled={soldOut || cantAfford}
          aria-label={
            soldOut
              ? `${entry.name} is out of stock`
              : `Buy ${entry.name} for ${entry.price}m`
          }
          title={
            soldOut
              ? 'Out of stock'
              : `Buy ${entry.name} for ${entry.price}m including Crown duty`
          }
          onClick={onBuy}
        >
          {soldOut ? 'Out' : 'Buy'}
        </button>
      </td>
    </tr>
  );
};

const Manifest = (props: { label: string; children: ReactNode }) => (
  <table className="GoldfaceCultural__manifest" aria-label={props.label}>
    <thead>
      <tr>
        <th scope="col">Goods</th>
        <th scope="col">Pack</th>
        <th scope="col">Stock</th>
        <th scope="col">Total</th>
        <th scope="col">
          <span className="GoldfaceCultural__srOnly">Purchase</span>
        </th>
      </tr>
    </thead>
    <tbody>{props.children}</tbody>
  </table>
);

const CatalogSection = (props: {
  catalog: CatalogData;
  budget: number;
  act: ActFn;
}) => {
  const { catalog, budget, act } = props;
  const accessible = !!catalog.accessible;
  return (
    <ManifestSection
      name={catalog.name}
      summary={
        catalog.origin_access
          ? `Open to you, ${catalog.discount_pct}% off`
          : catalog.unlocked
            ? 'Agreement signed'
            : `Sealed, ${catalog.favor_cost} favor to sign`
      }
      defaultExpanded={accessible}
    >
      <p className="GoldfaceCultural__note">{catalog.desc}</p>
      {accessible ? (
        <>
          <p className="GoldfaceCultural__note">
            The caravan restocks to its full load each day.
          </p>
          {catalog.entries.length ? (
            <Manifest label={`${catalog.name} stock`}>
              {catalog.entries.map((entry) => (
                <StockRow
                  key={entry.pack}
                  entry={entry}
                  budget={budget}
                  onBuy={() =>
                    act('catalog_buy', {
                      catalog: catalog.id,
                      pack: entry.pack,
                    })
                  }
                />
              ))}
            </Manifest>
          ) : (
            <p className="GoldfaceCultural__note">
              No goods are listed for this charter.
            </p>
          )}
        </>
      ) : (
        <p className="GoldfaceCultural__note">
          This charter is sealed. Open it in Management for {catalog.favor_cost}{' '}
          favor.
        </p>
      )}
    </ManifestSection>
  );
};

export const CulturalStockTab = (props: Props) => {
  const { stock, catalogs = [], kinship, budget, isAgent, act } = props;
  const byShip = new Map<
    string,
    { name: string; entries: CulturalStockEntry[] }
  >();
  for (const entry of stock) {
    const existing = byShip.get(entry.ship_id);
    if (existing) {
      existing.entries.push(entry);
    } else {
      byShip.set(entry.ship_id, { name: entry.ship_name, entries: [entry] });
    }
  }
  const ships = Array.from(byShip.entries());

  return (
    <div className="GoldfaceCultural">
      {(isAgent || kinship?.realm_name || kinship?.agent_realm_name) && (
        <details className="GoldfaceCultural__terms">
          <summary>
            Trade privileges
            {isAgent && <span>Chartered Agent</span>}
            {kinship?.realm_name && <span>Kinship: {kinship.realm_name}</span>}
            {kinship?.agent_realm_name && (
              <span>Agent Kinship: {kinship.agent_realm_name}</span>
            )}
          </summary>
          {isAgent && (
            <p>
              As an agent of the Ferentian Trading Company, you are allowed to
              access, view, and purchase the Cultural Stock of any docked ships,
              and view and hail ships on behalf of the Factor.
            </p>
          )}
          {kinship?.realm_name && (
            <p>
              Cultural stock from {kinship.realm_name} ships costs{' '}
              {kinship.buy_pct}% less.
            </p>
          )}
          {kinship?.agent_realm_name && (
            <p>
              As an Agent, your buys from {kinship.agent_realm_name} ships cost{' '}
              {kinship.buy_pct}% less.
            </p>
          )}
        </details>
      )}
      <h2>Dockside cargo</h2>
      <p className="GoldfaceCultural__note">
        {ships.length
          ? 'Goods of distinction unloaded by docked vessels. They depart when she sails.'
          : 'No cultural stock is available at the pier. Hail a vessel to access her cultural stores.'}
      </p>
      {ships.map(([shipId, info]) => (
        <ManifestSection
          key={shipId}
          name={info.name}
          summary={`${info.entries.length} wares`}
          defaultExpanded={ships.length === 1}
        >
          <Manifest label={`${info.name} cargo`}>
            {info.entries.map((entry) => (
              <StockRow
                key={entry.pack}
                entry={entry}
                budget={budget}
                onBuy={() =>
                  act('cultural_buy', {
                    pack: entry.pack,
                    ship_id: entry.ship_id,
                  })
                }
              />
            ))}
          </Manifest>
        </ManifestSection>
      ))}
      {catalogs.length > 0 && (
        <>
          <h2>Trade agreements</h2>
          {catalogs.map((catalog) => (
            <CatalogSection
              key={catalog.id}
              catalog={catalog}
              budget={budget}
              act={act}
            />
          ))}
        </>
      )}
    </div>
  );
};
