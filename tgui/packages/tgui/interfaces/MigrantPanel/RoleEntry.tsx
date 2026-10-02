import type { BooleanLike } from 'tgui-core/react';

import type { MigrantAct, Role } from './types';

export const RoleEntry = ({
  role,
  waveRef,
  waveQueued,
  act,
}: {
  role: Role;
  waveRef?: string;
  waveQueued?: BooleanLike;
  act?: MigrantAct;
}) => {
  const claimed = !!waveQueued && !!role.queued;
  const label = (
    <>
      <span>{role.name}</span>{' '}
      <span className="MigrantPanel__muted">x{role.amount}</span>
    </>
  );
  return (
    <li className="MigrantPanel__role">
      <div className="MigrantPanel__roleText">
        {role.desc ? (
          <details>
            <summary>{label}</summary>
            <p className="MigrantPanel__description">{role.desc}</p>
          </details>
        ) : (
          <span>{label}</span>
        )}
        {!act && (
          <span className={`MigrantPanel__${role.kind}`}>
            {role.kind === 'required' ? 'Required' : 'Optional'}
          </span>
        )}
      </div>
      {act && waveRef && (
        <div className="MigrantPanel__roleActions">
          {role.stars > 0 && (
            <span
              className="MigrantPanel__stars"
              title={`${role.stars} players queued for this role`}
              aria-label={`${role.stars} players queued for this role`}
            >
              {'★'.repeat(Math.min(role.stars, 5))}
            </span>
          )}
          <button
            type="button"
            aria-pressed={claimed}
            disabled={!role.can_be}
            aria-label={`${claimed ? 'Queued' : 'Queue'} as ${role.name}`}
            onClick={() => {
              if (role.can_be)
                act('queue_role', { wave: waveRef, role: role.ref });
            }}
          >
            {claimed ? '✓ Queued' : 'Queue'}
          </button>
        </div>
      )}
    </li>
  );
};
