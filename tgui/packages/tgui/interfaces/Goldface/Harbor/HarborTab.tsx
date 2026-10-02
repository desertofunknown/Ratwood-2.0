import { useState } from 'react';

import type { ActFn, HarborData } from '../types';
import { RealmsView } from './RealmsView';
import { ShipsView } from './ShipsView';

export const HarborTab = (props: {
  harbor?: HarborData;
  budget: number;
  isAgent?: boolean;
  act: ActFn;
}) => {
  const { harbor, budget, isAgent, act } = props;
  const [tab, setTab] = useState<'ships' | 'realms'>('ships');
  return (
    <div className="GoldfaceHarbor">
      <header className="GoldfaceHarbor__register">
        <h2>Harbor register</h2>
        {harbor && (
          <div className="GoldfaceHarbor__figures">
            <span>
              Hails today{' '}
              <strong>
                {harbor.hails_remaining} / {harbor.hails_per_day}
              </strong>
            </span>
            <span>
              Pier spots{' '}
              <strong>
                {harbor.dock_spots_used} / {harbor.dock_spots_max}
              </strong>
            </span>
            <span>
              Purse <strong>{budget}m</strong>
            </span>
          </div>
        )}
      </header>
      {isAgent && (
        <details className="GoldfaceHarbor__help">
          <summary>Chartered Agent privileges</summary>
          <p>
            As an agent of the Ferentian Trading Company, you are allowed to
            access, view, and purchase the Cultural Stock of any docked ships,
            and view and hail ships on behalf of the Factor.
          </p>
        </details>
      )}
      {!harbor ? (
        <p className="GoldfaceHarbor__empty">
          The harbor reports are not yet drawn up.
        </p>
      ) : (
        <>
          {(harbor.kinship?.realm_name || harbor.kinship?.agent_realm_name) && (
            <details className="GoldfaceHarbor__help">
              <summary>
                Kinship:{' '}
                {[
                  harbor.kinship.realm_name,
                  harbor.kinship.agent_realm_name &&
                    `Agent — ${harbor.kinship.agent_realm_name}`,
                ]
                  .filter(Boolean)
                  .join('; ')}
              </summary>
              {harbor.kinship.realm_name && (
                <p>
                  At least one ship from {harbor.kinship.realm_name} will sail
                  per dae, sell {harbor.kinship.buy_pct}% cheaper, and pay{' '}
                  {harbor.kinship.sell_pct}% more on bulk demand.
                </p>
              )}
              {harbor.kinship.agent_realm_name && (
                <p>
                  As an Agent, your buys from {harbor.kinship.agent_realm_name}{' '}
                  ships cost {harbor.kinship.buy_pct}% less.
                </p>
              )}
            </details>
          )}
          <nav className="GoldfaceHarbor__tabs" aria-label="Harbor views">
            <button
              type="button"
              aria-pressed={tab === 'ships'}
              onClick={() => setTab('ships')}
            >
              Ships
            </button>
            <button
              type="button"
              aria-pressed={tab === 'realms'}
              onClick={() => setTab('realms')}
            >
              Realms
            </button>
            <span>Ctrl+F to find a good or realm.</span>
          </nav>
          {tab === 'ships' ? (
            <ShipsView
              docked={harbor.ships_docked}
              pool={harbor.ships_pool}
              dockSpotsUsed={harbor.dock_spots_used}
              dockSpotsMax={harbor.dock_spots_max}
              hailsRemaining={harbor.hails_remaining}
              budget={budget}
              act={act}
              realms={harbor.realms}
              tariffRate={harbor.bulk_tariff_rate}
            />
          ) : (
            <RealmsView realms={harbor.realms} />
          )}
        </>
      )}
    </div>
  );
};
