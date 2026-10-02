import { useEffect, useRef, useState } from 'react';
import { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../../backend';

type DecreeCategory = 'ancient' | 'new';

type Decree = {
  id: string;
  name: string;
  year: number;
  category: DecreeCategory;
  mechanical: string;
  flavor: string;
};

type DecreeState = {
  id: string;
  active: BooleanLike;
  cooldown_left: number;
  sequestration_locked: BooleanLike;
};

type Data = {
  decrees: Decree[];
  states: DecreeState[];
  revoke_used_today: BooleanLike;
  restore_used_today: BooleanLike;
};

const formatCooldown = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const CATEGORY_LABELS: Record<DecreeCategory, string> = {
  ancient: 'Ancient Charters',
  new: 'New Charters',
};

const CONFIRM_TIMEOUT_MS = 3000;

const DecreeEntry = (props: {
  decree: Decree;
  state: DecreeState | undefined;
  revokeUsed: boolean;
  restoreUsed: boolean;
  onToggle: () => void;
}) => {
  const { decree, state, revokeUsed, restoreUsed, onToggle } = props;
  const [armed, setArmed] = useState(false);
  const armedTimerRef = useRef<number | null>(null);
  const confirmUntilRef = useRef(0);
  const active = state ? !!state.active : undefined;
  const cooldownLeft = state?.cooldown_left ?? 0;
  const onCooldown = cooldownLeft > 0;
  const slotUsed = active ? revokeUsed : restoreUsed;
  const sequestrationLocked = !!state?.sequestration_locked;
  const disabled = !state || onCooldown || slotUsed || sequestrationLocked;
  const baseLabel =
    active === undefined ? 'Unavailable' : active ? 'Suspend' : 'Restore';
  const statusLabel =
    active === undefined
      ? 'State unavailable'
      : active
        ? 'In force'
        : 'Suspended';
  const tooltip = !state
    ? 'The current decree state is unavailable.'
    : sequestrationLocked
      ? 'Sequestration prevents changes to this charter.'
      : onCooldown
        ? `On cooldown: ${formatCooldown(cooldownLeft)}`
        : slotUsed
          ? `A ${active ? 'revocation' : 'restoration'} has already been proclaimed today.`
          : armed
            ? 'Activate again to confirm. Auto-cancels in 3 seconds.'
            : `${baseLabel} this decree`;

  useEffect(() => {
    setArmed(false);
    confirmUntilRef.current = 0;
    return () => {
      confirmUntilRef.current = 0;
      if (armedTimerRef.current !== null) {
        window.clearTimeout(armedTimerRef.current);
        armedTimerRef.current = null;
      }
    };
  }, [decree.id, active, onCooldown, slotUsed, sequestrationLocked]);

  const handleClick = () => {
    if (disabled) return;
    const confirmed = armed && Date.now() < confirmUntilRef.current;
    if (armedTimerRef.current !== null) {
      window.clearTimeout(armedTimerRef.current);
      armedTimerRef.current = null;
    }
    if (confirmed) {
      confirmUntilRef.current = 0;
      setArmed(false);
      onToggle();
      return;
    }
    confirmUntilRef.current = Date.now() + CONFIRM_TIMEOUT_MS;
    setArmed(true);
    armedTimerRef.current = window.setTimeout(() => {
      confirmUntilRef.current = 0;
      setArmed(false);
      armedTimerRef.current = null;
    }, CONFIRM_TIMEOUT_MS);
  };

  return (
    <article className="DecreeRegister__entry">
      <div className="DecreeRegister__heading">
        <h2>
          {decree.name}{' '}
          <span className="DecreeRegister__year">of {decree.year}</span>
        </h2>
        <span
          className={`DecreeRegister__status${active === undefined ? '' : active ? ' DecreeRegister__status--active' : ' DecreeRegister__status--suspended'}`}
        >
          {statusLabel}
        </span>
        <button
          type="button"
          className="DecreeRegister__action"
          disabled={disabled}
          title={tooltip}
          onClick={handleClick}
        >
          {armed && !disabled ? `Confirm ${baseLabel}?` : baseLabel}
        </button>
      </div>
      {decree.mechanical && <p>{decree.mechanical}</p>}
      {sequestrationLocked && (
        <p className="DecreeRegister__note">
          Sequestration prevents changes to this charter.
        </p>
      )}
      {onCooldown && (
        <p className="DecreeRegister__note">
          Cooldown: {formatCooldown(cooldownLeft)}
        </p>
      )}
      {armed && !disabled && (
        <p className="DecreeRegister__note" role="status">
          Confirm within 3 seconds.
        </p>
      )}
      {decree.flavor && (
        <details className="DecreeRegister__charter">
          <summary>Charter text</summary>
          <div className="DecreeRegister__lore">{decree.flavor}</div>
        </details>
      )}
    </article>
  );
};

export const DecreeRegister = () => {
  const { act, data } = useBackend<Data>();
  const [tab, setTab] = useState<DecreeCategory>('ancient');
  const stateById = Object.fromEntries(
    (data.states ?? []).map((s) => [s.id, s]),
  );
  const revokeUsed = !!data.revoke_used_today;
  const restoreUsed = !!data.restore_used_today;
  const decrees = data.decrees ?? [];
  const ancient = decrees.filter((d) => d.category === 'ancient');
  const newer = decrees.filter((d) => d.category === 'new');
  const visible = tab === 'ancient' ? ancient : newer;

  return (
    <div className="DecreeRegister">
      <div className="DecreeRegister__daily">
        <span>Today</span>
        <span>Revocation: {revokeUsed ? 'used' : 'available'}</span>
        <span>Restoration: {restoreUsed ? 'used' : 'available'}</span>
      </div>
      <nav className="DecreeRegister__categories" aria-label="Charter category">
        {(['ancient', 'new'] as const).map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={tab === category}
            onClick={() => setTab(category)}
          >
            {CATEGORY_LABELS[category]} (
            {category === 'ancient' ? ancient.length : newer.length})
          </button>
        ))}
      </nav>
      {visible.length === 0 ? (
        <p className="DecreeRegister__empty">No charters in this category.</p>
      ) : (
        visible.map((decree) => (
          <DecreeEntry
            key={decree.id}
            decree={decree}
            state={stateById[decree.id]}
            revokeUsed={revokeUsed}
            restoreUsed={restoreUsed}
            onToggle={() => act('toggle', { id: decree.id })}
          />
        ))
      )}
    </div>
  );
};
