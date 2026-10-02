import { useState } from 'react';

import { useBackend } from '../../backend';
import { OccupancyPanel } from './OccupancyPanel';
import type { ZadcageAct, ZadcageData } from './types';

const SummonPanel = ({ data, act }: { data: ZadcageData; act: ZadcageAct }) => {
  const [zads, setZads] = useState(1);
  const maySummon =
    !data.occupied && data.bonded && !data.severed && data.allow_summons;
  if (!maySummon) return null;
  return (
    <section className="Zadcage__summon" aria-label="Summon a flight">
      <h2>Summon a flight</h2>
      <p className="Zadcage__muted">
        {data.pending_flight
          ? 'A flight is already on the way.'
          : `Call a flight from ${data.cote_name || 'the zadcote'}. It will arrive in about a minute. Load any package onto it once it lands.`}
      </p>
      {!data.pending_flight && (
        <>
          <div className="Zadcage__picker" role="group" aria-label="Zads">
            <span>Zads</span>
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={zads === count}
                onClick={() => setZads(count)}
              >
                {count}
              </button>
            ))}
          </div>
          <p className="Zadcage__muted">
            {zads === 1
              ? '1 zad: tiny or small return parcel.'
              : zads === 2
                ? '2 zads: pouch, helmet, or normal-sized return.'
                : '3 zads: bulky return parcel or large container.'}
          </p>
        </>
      )}
      <button
        type="button"
        disabled={data.pending_flight}
        onClick={() => {
          if (maySummon && !data.pending_flight)
            act('request_summon', { zads });
        }}
      >
        Summon
      </button>
    </section>
  );
};

export const ZadcageContent = () => {
  const { data, act } = useBackend<ZadcageData>();
  return (
    <main className="Zadcage">
      <header className="Zadcage__heading">
        <p>
          {data.bonded
            ? `${data.cote_name} - Slot ${data.slot_index}: ${data.slot_label}`
            : 'Unbonded - strike against a zadcote to bond.'}
        </p>
        <button
          type="button"
          title="Open the zadcote handbook"
          onClick={() => act('help')}
        >
          Handbook
        </button>
      </header>
      {!!data.severed && (
        <p className="Zadcage__warning">The zadlink has been severed.</p>
      )}
      {!data.occupied &&
        !!data.bonded &&
        !data.severed &&
        data.stored_payload.length === 0 && (
          <p className="Zadcage__empty">
            No zad in the cage. Wait for one to arrive.
          </p>
        )}
      <SummonPanel data={data} act={act} />
      {data.stored_payload.length > 0 && (
        <section className="Zadcage__stored" aria-label="Held in the cage">
          <h2>Held in the cage</h2>
          <ul>
            {data.stored_payload.map((item, index) => (
              <li key={index}>{item.name}</li>
            ))}
          </ul>
          <button type="button" onClick={() => act('retrieve')}>
            Retrieve
          </button>
        </section>
      )}
      {!!data.occupied && (
        <OccupancyPanel key={data.flight_ref} data={data} act={act} />
      )}
    </main>
  );
};
