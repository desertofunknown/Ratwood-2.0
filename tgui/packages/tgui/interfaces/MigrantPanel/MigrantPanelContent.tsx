import { useState } from 'react';

import { useBackend } from '../../backend';
import { FormingTrack } from './FormingTrack';
import { PledgeEntry } from './PledgeEntry';
import { fmtClock } from './types';
import type { MigrantData } from './types';

export const MigrantPanelContent = () => {
  const { data, act } = useBackend<MigrantData>();
  const [tab, setTab] = useState<'regular' | 'special'>('regular');
  const now = data.server_time;
  const queuedWave =
    data.forming.find((wave) => wave.ref === data.queued_wave) ??
    data.waves.find((wave) => wave.ref === data.queued_wave);
  const queuedRole = queuedWave?.roles.find(
    (role) => role.ref === data.queued_role,
  );
  const waves = data.waves.filter((wave) => wave.track === tab);
  const formingEvent = data.forming.find((wave) => wave.track === 'event');
  return (
    <main className="MigrantPanel">
      <p className="MigrantPanel__intro">
        The mist parts, and travellers find their way to Rotwood Vale.
      </p>
      <div className="MigrantPanel__status">
        <span>
          Wave {data.wave_number} · Triumph: {data.player_triumph}
        </span>
        <span className="MigrantPanel__muted">
          Queued: {data.active_migrants}
        </span>
      </div>
      <div className="MigrantPanel__queue">
        {data.queued_wave ? (
          <>
            <button type="button" onClick={() => act('clear_queue')}>
              {queuedWave
                ? `Queued: ${queuedWave.name} (leave)`
                : 'Queued (leave)'}
            </button>
            {queuedRole && <span>{queuedRole.name}</span>}
          </>
        ) : (
          <span className="MigrantPanel__muted">
            Pick a role on a forming wave to queue
          </span>
        )}
      </div>
      <h2>Active Tracks - Queue Here</h2>
      <div className="MigrantPanel__tracks">
        <FormingTrack
          label="Regular"
          forming={data.forming.find((wave) => wave.track === 'regular')}
          emptyText={`Next in ${fmtClock(data.next_regular_at - now)}`}
          now={now}
          act={act}
        />
        <FormingTrack
          label="Special"
          forming={data.forming.find((wave) => wave.track === 'special')}
          emptyText={`Next in ${fmtClock(data.next_special_at - now)}`}
          now={now}
          act={act}
        />
        <FormingTrack
          label="Triumph"
          forming={data.forming.find((wave) => wave.track === 'triumph')}
          emptyText="Pledge to call a wave"
          now={now}
          act={act}
        />
        {formingEvent && (
          <FormingTrack
            label="Event"
            forming={formingEvent}
            emptyText=""
            now={now}
            act={act}
          />
        )}
      </div>
      <nav className="MigrantPanel__tabs" aria-label="Migrant pledges">
        <button
          type="button"
          aria-pressed={tab === 'regular'}
          onClick={() => setTab('regular')}
        >
          Regular Migrants
        </button>
        <button
          type="button"
          aria-pressed={tab === 'special'}
          onClick={() => setTab('special')}
        >
          Special Arrivals
        </button>
      </nav>
      <p className="MigrantPanel__pledgeNote">
        Pledge triumph to weight or guarantee a wave&apos;s arrival.
      </p>
      <section aria-label="Pledge catalog">
        {waves.length === 0 ? (
          <p className="MigrantPanel__muted">None available.</p>
        ) : (
          waves.map((wave) => (
            <PledgeEntry key={wave.ref} wave={wave} now={now} act={act} />
          ))
        )}
      </section>
    </main>
  );
};
