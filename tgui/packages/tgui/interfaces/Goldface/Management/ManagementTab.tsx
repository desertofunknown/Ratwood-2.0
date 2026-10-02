import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { ActFn, CatalogData, FavorData, HarborData } from '../types';

const RateControl = ({
  title,
  action,
  current,
  cap,
  children,
  act,
}: {
  title: string;
  action: string;
  current: number;
  cap: number;
  children: ReactNode;
  act: ActFn;
}) => {
  const [draft, setDraft] = useState(String(current));
  const previous = useRef(current);
  useEffect(() => {
    const old = previous.current;
    previous.current = current;
    setDraft((value) =>
      value.trim() !== '' && Number(value) === old ? String(current) : value,
    );
  }, [current]);
  const numeric = Number(draft);
  const dirty =
    draft !== '' &&
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= cap &&
    numeric !== current;
  return (
    <section className="GoldfaceOffice__section">
      <h2>{title}</h2>
      <div className="GoldfaceOffice__rate">
        <span>
          Current <b>{current}%</b>
        </span>
        <label>
          Set to
          <input
            aria-label={`New ${title.toLowerCase()}`}
            type="number"
            min={0}
            max={cap}
            step={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => act(action, { percent: numeric })}
        >
          Set
        </button>
      </div>
      <details className="GoldfaceOffice__details">
        <summary>Terms</summary>
        <p>{children}</p>
      </details>
    </section>
  );
};

const FavorPurchase = ({
  label,
  flavor,
  cost,
  current,
  done,
  doneLabel,
  action,
  params,
  act,
}: {
  label: string;
  flavor: string;
  cost: number;
  current: number;
  done: boolean;
  doneLabel: string;
  action: string;
  params?: Record<string, unknown>;
  act: ActFn;
}) => (
  <div className="GoldfaceOffice__purchase">
    <details className="GoldfaceOffice__details">
      <summary>{label}</summary>
      <p>{flavor}</p>
    </details>
    <span className={done ? 'GoldfaceOffice__good' : 'GoldfaceOffice__amount'}>
      {done ? doneLabel : `${cost} favor`}
    </span>
    <button
      type="button"
      aria-label={`Spend favor: ${label}`}
      disabled={done || current < cost}
      onClick={() => act(action, params)}
    >
      {done
        ? 'In effect'
        : current >= cost
          ? 'Spend favor'
          : 'Not enough favor'}
    </button>
  </div>
);

const FavorPurchases = ({
  favor,
  catalogs,
  act,
}: {
  favor: FavorData;
  catalogs: CatalogData[];
  act: ActFn;
}) => (
  <section className="GoldfaceOffice__section">
    <h2>
      Spend favor{' '}
      <span className="GoldfaceOffice__muted">{favor.current} on hand</span>
    </h2>
    <FavorPurchase
      label="Rent the fishermen's pier"
      flavor="Use your influence to rent an additional pier at the dock for this week, letting more ships dock. It is not like the fishermen are using it, anyway."
      cost={favor.pier_cost}
      current={favor.current}
      done={!!favor.pier_rented}
      doneLabel="Let this week"
      action="rent_pier"
      act={act}
    />
    <FavorPurchase
      label="Call in the Company Gnomes"
      flavor="Invoke the contract with the Ferentian Guild of Gnomes Porters, letting them handle Silverface sales and recovering the margins for yourself. For some odd reasons no one have ever spotted these gnomes. Do not let this deter you, you shall profit greatly without lifting a finger for the rest of the week."
      cost={favor.gnome_cost}
      current={favor.current}
      done={!!favor.gnome_unlocked}
      doneLabel="On the payroll"
      action="unlock_gnomes"
      act={act}
    />
    {!favor.auto_hailer_unlocked ? (
      <FavorPurchase
        label="Retain the Harbor Crew"
        flavor="Put the Captain of Stevedores on a permanent retainer. Once paid up, you may set them at the docks at any time, hailing ships randomly and dismissing those that have lingered too long. Useful when the wharf must run without you - but beware: Ships that fail to meet their trade obligations will still drag your favor down with the Company, even into the red."
        cost={favor.auto_hailer_cost}
        current={favor.current}
        done={false}
        doneLabel="On retainer"
        action="unlock_auto_hailer"
        act={act}
      />
    ) : (
      <div className="GoldfaceOffice__purchase">
        <details className="GoldfaceOffice__details">
          <summary>Auto-Hailer (Harbor Crew)</summary>
          <p>
            While the crew works, ships are hailed up to the daily cap and
            dismissed once they have honored their tonnage or sat in port a full
            day. <b>Dishonored dismissals will sink your favor into the red</b>{' '}
            - leave it on, and you may return to a debt.
          </p>
        </details>
        <span
          className={
            favor.auto_hailer_on
              ? 'GoldfaceOffice__good'
              : 'GoldfaceOffice__muted'
          }
        >
          {favor.auto_hailer_on ? 'Working' : 'Standing down'}
        </span>
        <button type="button" onClick={() => act('toggle_auto_hailer')}>
          {favor.auto_hailer_on ? 'Stand down' : 'Set the crew to work'}
        </button>
      </div>
    )}
    {catalogs.map((catalog) => (
      <FavorPurchase
        key={catalog.id}
        label={`Open the ${catalog.name}`}
        flavor={
          catalog.desc +
          (catalog.origin_access
            ? ` Your ${catalog.home_label} already opens it to you at ${catalog.discount_pct}% off; pay to extend the charter to the whole company.`
            : '')
        }
        cost={catalog.favor_cost}
        current={favor.current}
        done={!!catalog.unlocked}
        doneLabel="Charter open"
        action="unlock_catalog"
        params={{ catalog: catalog.id }}
        act={act}
      />
    ))}
  </section>
);

const Standing = ({ favor }: { favor: FavorData }) => {
  const atCap =
    favor.triumph_bonus >= favor.triumph_cap || favor.bracket_next === 0;
  return (
    <section className="GoldfaceOffice__section">
      <h2>Standing with the Company</h2>
      <dl className="GoldfaceOffice__entries">
        <div>
          <dt>Favor on hand</dt>
          <dd>{favor.current}m</dd>
        </div>
        <div>
          <dt>Lyfetime peak</dt>
          <dd>{favor.high_water}m</dd>
        </div>
        <div>
          <dt>Triumph bonus</dt>
          <dd>
            +{favor.triumph_bonus} / +{favor.triumph_cap}
          </dd>
        </div>
        <div>
          <dt>Next bonus</dt>
          <dd>
            {atCap
              ? 'Bonus maxed out'
              : `+${favor.triumph_bonus + 1} at ${favor.bracket_next}m`}
          </dd>
        </div>
      </dl>
      <details className="GoldfaceOffice__details">
        <summary>Favor and triumph terms</summary>
        <p>
          Earned by sending ships off satisfied or passive trades through
          Silverface, Goldface and Navigator (At 0.5x value). Spent on Company
          favors. Volume hit also determines the Merchant and Shopshands end of
          round triumph bonus - spending favor does not subtract from it.
        </p>
        <ol className="GoldfaceOffice__thresholds">
          {favor.brackets.map((threshold, index) => (
            <li
              key={threshold}
              className={
                favor.high_water >= threshold
                  ? 'GoldfaceOffice__good'
                  : undefined
              }
            >
              +{index + 1} Triumph at {threshold}m volume
              {favor.high_water >= threshold ? ' — earned' : ''}
            </li>
          ))}
        </ol>
      </details>
      <details className="GoldfaceOffice__details">
        <summary>Favor sources this week</summary>
        <dl className="GoldfaceOffice__entries">
          <div>
            <dt>Ship send-offs</dt>
            <dd>+{favor.from_sendoffs}m</dd>
          </div>
          <div>
            <dt>Navigator trade</dt>
            <dd>+{favor.from_navigator}m</dd>
          </div>
          <div>
            <dt>Goldface imports</dt>
            <dd>+{favor.from_goldface}m</dd>
          </div>
          <div>
            <dt>Silverface imports</dt>
            <dd>+{favor.from_silverface}m</dd>
          </div>
          {favor.penalties > 0 && (
            <div>
              <dt>Dishonor penalties</dt>
              <dd className="GoldfaceOffice__bad">-{favor.penalties}m</dd>
            </div>
          )}
        </dl>
      </details>
    </section>
  );
};

export const ManagementTab = ({
  harbor,
  act,
}: {
  harbor?: HarborData;
  act: ActFn;
}) => {
  if (!harbor)
    return (
      <p className="Goldface__notice">The ledgers are not yet drawn up.</p>
    );
  const favor = harbor.favor;
  return (
    <div className="GoldfaceOffice">
      <div className="GoldfaceOffice__columns">
        <div>
          <Standing favor={favor} />
          <RateControl
            title="Merchant's levy"
            action="set_levy"
            current={harbor.merchant_levy_percent}
            cap={harbor.merchant_levy_cap}
            act={act}
          >
            Your cut on every export sold through the public Navigator and the
            ship fulfillment crate. The Crown taxes your cut as income at the
            prevailing export duty rate. Capped at {harbor.merchant_levy_cap}%.
          </RateControl>
          {!!favor.gnome_unlocked && (
            <RateControl
              title="Silverface margin"
              action="set_gnome_margin"
              current={harbor.ledger.silverface_margin_percent}
              cap={100}
              act={act}
            >
              The Company Gnomes price every Silverface stall at base cost plus
              this margin. The margin flows to the Merchant Fund. Higher rates
              earn more per sale but drive customers off; lower rates win
              volume.
            </RateControl>
          )}
        </div>
        <FavorPurchases
          favor={favor}
          catalogs={harbor.catalogs ?? []}
          act={act}
        />
      </div>
      <section className="GoldfaceOffice__section">
        <h2>Recent send-offs</h2>
        {!favor.ledger.length ? (
          <p className="GoldfaceOffice__muted">
            No ships sent off yet this week.
          </p>
        ) : (
          <table className="GoldfaceOffice__table GoldfaceOffice__table--sendoffs">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Vessel / realm</th>
                <th>Favor</th>
              </tr>
            </thead>
            <tbody>
              {favor.ledger.map((entry, index) => (
                <tr key={index}>
                  <td
                    className={
                      entry.outcome === 'honored'
                        ? 'GoldfaceOffice__good'
                        : entry.outcome === 'dishonored'
                          ? 'GoldfaceOffice__bad'
                          : undefined
                    }
                  >
                    {entry.outcome}
                  </td>
                  <td>
                    {entry.ship_name} — {entry.realm_label}
                    {!!entry.refunded_hail && (
                      <span className="GoldfaceOffice__good">
                        {' '}
                        (hail refunded)
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.awarded >= 0 ? '+' : ''}
                    {entry.awarded}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
