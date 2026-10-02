import { useEffect, useId, useState } from 'react';

import { SendPanel } from './SendPanel';
import { formatCountdown } from './types';
import type { ZadcoteAct, ZadcoteData, ZadcoteSlot } from './types';

const Status = ({ slot }: { slot: ZadcoteSlot }) => {
  if (slot.in_flight) {
    const direction =
      slot.flight_direction === 'return' ? 'returning' : 'outbound';
    const countdown = formatCountdown(slot.flight_arrival_seconds ?? 0);
    return (
      <span
        className="Zadcote__accent"
        title={`A flight is ${direction}, arriving in ${countdown}`}
      >
        {direction}
        {slot.flight_zads ? ` (${slot.flight_zads})` : ''} — {countdown}
      </span>
    );
  }
  if (slot.severed) return <span className="Zadcote__bad">Severed</span>;
  if (!slot.bonded)
    return <span className="Zadcote__muted">Awaiting a cage</span>;
  return <span className="Zadcote__good">Linked</span>;
};

const SlotNameField = ({
  slot,
  canOperate,
  act,
}: {
  slot: ZadcoteSlot;
  canOperate: boolean;
  act: ZadcoteAct;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  // Acknowledged names resume following the server; unsaved edits stay local.
  useEffect(() => {
    if (draft === slot.name) setDraft(null);
  }, [draft, slot.name]);
  const name = draft ?? slot.name;
  const dirty = name.trim() !== slot.name.trim();
  return (
    <details className="Zadcote__rename">
      <summary>Rename</summary>
      <div>
        <label>
          Slot {slot.slot} name
          <input
            type="text"
            value={name}
            maxLength={32}
            placeholder={`Slot ${slot.slot}`}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!dirty || !canOperate}
          onClick={() => {
            if (dirty && canOperate)
              act('set_slot_name', { slot: slot.slot, name });
          }}
        >
          Set
        </button>
      </div>
    </details>
  );
};

export const SlotRow = ({
  data,
  slot,
  expanded,
  onToggle,
  act,
}: {
  data: ZadcoteData;
  slot: ZadcoteSlot;
  expanded: boolean;
  onToggle: () => void;
  act: ZadcoteAct;
}) => {
  const id = useId();
  const canSever = data.can_operate && slot.bonded && !slot.severed;
  const fundsOk = data.voyeur_fund >= data.voyeur_cost;
  const canVoyeur = data.allows_voyeur && canSever && fundsOk;
  return (
    <article
      className="Zadcote__slot"
      data-slot={slot.slot}
      aria-labelledby={`${id}-title`}
    >
      <header className="Zadcote__slotHeading">
        <h2 id={`${id}-title`}>
          <span className="Zadcote__muted">#{slot.slot}</span> {slot.label}
        </h2>
        <Status slot={slot} />
      </header>
      <fieldset disabled={!data.can_operate}>
        <div className="Zadcote__slotActions">
          <button
            type="button"
            disabled={slot.severed || !data.can_operate}
            aria-expanded={expanded}
            title={
              slot.in_flight
                ? 'A flight is already on this slot. You can prepare a dispatch for later.'
                : 'Send a dispatch on this slot.'
            }
            onClick={() => {
              if (!slot.severed && data.can_operate) onToggle();
            }}
          >
            {expanded ? 'Hide' : 'Send'}
          </button>
          {!!data.allows_voyeur && (
            <button
              type="button"
              disabled={!canVoyeur}
              title={
                !fundsOk
                  ? `Scrying fund empty. Feed mammon coins into the zadcote (needs ${data.voyeur_cost}m).`
                  : canVoyeur
                    ? `Scry through the bonded zad. Costs ${data.voyeur_cost}m from the zadcote's scrying fund.`
                    : 'Voyeur unavailable.'
              }
              onClick={() => {
                if (canVoyeur) act('voyeur', { slot: slot.slot });
              }}
            >
              Scry
            </button>
          )}
          <button
            type="button"
            disabled={!canSever}
            title={
              slot.allow_summons
                ? 'Summons are allowed. The cage holder may summon a zad on demand.'
                : 'Summons are blocked. The cage holder cannot summon zads.'
            }
            onClick={() => {
              if (canSever) act('toggle_summons', { slot: slot.slot });
            }}
          >
            {slot.allow_summons ? 'Summons: on' : 'Summons: off'}
          </button>
          <button
            type="button"
            disabled={!canSever}
            title={
              canSever
                ? 'Sever this zadlink. A zad in flight will complete its trip first.'
                : 'Nothing to sever.'
            }
            onClick={() => {
              if (canSever) act('sever', { slot: slot.slot });
            }}
          >
            Sever
          </button>
          <SlotNameField slot={slot} canOperate={data.can_operate} act={act} />
        </div>
        <SendPanel
          key={slot.bond_ref}
          data={data}
          slot={slot}
          expanded={expanded}
          act={act}
          onClose={onToggle}
        />
      </fieldset>
    </article>
  );
};
