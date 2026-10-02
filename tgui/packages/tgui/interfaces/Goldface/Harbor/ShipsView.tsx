import { useMemo } from 'react';

import type { ActFn, HarborRealm, HarborShip } from '../types';
import { ShipRow } from './ShipRow';

export const ShipsView = (props: {
  docked: HarborShip[];
  pool: HarborShip[];
  dockSpotsUsed: number;
  dockSpotsMax: number;
  hailsRemaining: number;
  budget: number;
  tariffRate: number;
  act: ActFn;
  realms: HarborRealm[];
}) => {
  const {
    docked,
    pool,
    dockSpotsUsed,
    dockSpotsMax,
    hailsRemaining,
    budget,
    tariffRate,
    act,
    realms,
  } = props;
  const dockFull = dockSpotsUsed >= dockSpotsMax;
  const noHails = hailsRemaining <= 0;
  const realmsById = useMemo(
    () => new Map(realms.map((realm) => [realm.id, realm])),
    [realms],
  );
  return (
    <>
      <h3 className="GoldfaceHarbor__section">
        Docked at the Pier <span>({docked.length})</span>
      </h3>
      {docked.length === 0 ? (
        <p className="GoldfaceHarbor__empty">
          No vessels at the pier. Hail one from the horizon to bring her in.
        </p>
      ) : (
        docked.map((ship) => (
          <ShipRow
            key={ship.ship_id}
            ship={ship}
            budget={budget}
            tariffRate={tariffRate}
            act={act}
            realm={realmsById.get(ship.realm_id)}
            onSendAway={() => act('send_away', { ship_id: ship.ship_id })}
          />
        ))
      )}
      <h3 className="GoldfaceHarbor__section">
        Seen on the Horizon <span>({pool.length})</span>
      </h3>
      {pool.length === 0 ? (
        <p className="GoldfaceHarbor__empty">
          No vessels on the horizon. The dawn brings new arrivals.
        </p>
      ) : (
        pool.map((ship) => (
          <ShipRow
            key={ship.ship_id}
            ship={ship}
            budget={budget}
            tariffRate={tariffRate}
            act={act}
            realm={realmsById.get(ship.realm_id)}
            hailDisabled={dockFull || noHails}
            hailDisabledReason={
              noHails
                ? 'No hails left today.'
                : dockFull
                  ? 'The pier is full.'
                  : undefined
            }
            onHail={() => act('hail', { ship_id: ship.ship_id })}
          />
        ))
      )}
    </>
  );
};
