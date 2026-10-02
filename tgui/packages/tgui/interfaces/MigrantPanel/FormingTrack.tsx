import { RoleEntry } from './RoleEntry';
import { fmtClock } from './types';
import type { FormingWave, MigrantAct } from './types';

export const FormingTrack = ({
  label,
  forming,
  emptyText,
  now,
  act,
}: {
  label: string;
  forming?: FormingWave;
  emptyText: string;
  now: number;
  act: MigrantAct;
}) => {
  const required =
    forming?.roles.filter((role) => role.kind === 'required') ?? [];
  const optional =
    forming?.roles.filter((role) => role.kind === 'optional') ?? [];
  return (
    <section className="MigrantPanel__track" aria-label={`${label} track`}>
      <h3>{label}</h3>
      {!forming ? (
        <p className="MigrantPanel__muted">{emptyText}</p>
      ) : (
        <>
          <header className="MigrantPanel__waveHeading">
            <h4>{forming.name}</h4>
            <span className="MigrantPanel__arrival">
              Arrives in {fmtClock(forming.arrival_at - now)}
            </span>
          </header>
          {required.length > 0 && (
            <>
              <h5 className="MigrantPanel__required">Required</h5>
              <p className="MigrantPanel__muted">
                Must be filled or the wave will not arrive.
              </p>
              <ul>
                {required.map((role) => (
                  <RoleEntry
                    key={role.ref}
                    role={role}
                    waveRef={forming.ref}
                    waveQueued={forming.queued}
                    act={act}
                  />
                ))}
              </ul>
            </>
          )}
          {optional.length > 0 && (
            <>
              <h5 className="MigrantPanel__optional">
                {forming.min_optional_fills > 0
                  ? 'Required-Optional'
                  : 'Optional'}
              </h5>
              <p className="MigrantPanel__muted">
                {forming.min_optional_fills > 0
                  ? `At least ${forming.min_optional_fills} of these must join, but specific slots may stay empty.`
                  : 'Extra companions - empty slots are fine.'}
              </p>
              <ul>
                {optional.map((role) => (
                  <RoleEntry
                    key={role.ref}
                    role={role}
                    waveRef={forming.ref}
                    waveQueued={forming.queued}
                    act={act}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
};
