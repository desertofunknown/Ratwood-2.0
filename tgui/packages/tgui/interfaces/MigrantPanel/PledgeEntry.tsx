import { RoleEntry } from './RoleEntry';
import { fmtClock } from './types';
import type { MigrantAct, WaveInfo } from './types';

export const PledgeEntry = ({
  wave,
  now,
  act,
}: {
  wave: WaveInfo;
  now: number;
  act: MigrantAct;
}) => {
  const ready = wave.triumph_total >= wave.triumph_threshold;
  const locked = wave.locked_until > now;
  return (
    <article className="MigrantPanel__pledge" aria-label={wave.name}>
      <header>
        <h3>
          {wave.name}
          {!!wave.maxed && (
            <span className="MigrantPanel__muted"> (maxed)</span>
          )}
          {ready && !wave.maxed && (
            <span className="MigrantPanel__required"> (ready!)</span>
          )}
        </h3>
        <span className="MigrantPanel__muted">
          {locked
            ? `locked ${fmtClock(wave.locked_until - now)}`
            : `${wave.roll_chance}%`}
        </span>
        <button
          type="button"
          disabled={!!wave.maxed}
          onClick={() => {
            if (!wave.maxed) act('buy_wave', { wave: wave.ref });
          }}
        >
          Pledge
        </button>
      </header>
      <div className="MigrantPanel__pledgeProgress">
        <progress
          value={wave.triumph_total}
          max={wave.triumph_threshold}
          aria-label={`Triumph pledged to ${wave.name}`}
        />
        <span>
          {wave.triumph_total}/{wave.triumph_threshold}
          {wave.my_contribution > 0 ? ` (you: ${wave.my_contribution})` : ''}
          {wave.min_optional_fills > 0
            ? ` · Min. Optionals: ${wave.min_optional_fills}`
            : ''}
        </span>
      </div>
      <ul className="MigrantPanel__catalogRoles">
        {wave.roles.map((role) => (
          <RoleEntry key={`${role.kind}:${role.ref}`} role={role} />
        ))}
      </ul>
    </article>
  );
};
