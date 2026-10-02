import { useId, useState } from 'react';

import {
  formatCountdown,
  maxWeightForTier,
  MESSAGE_MAX,
  weightLabel,
} from './types';
import type { ZadcoteAct, ZadcoteData, ZadcoteSlot } from './types';

const Picker = ({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) => (
  <div className="Zadcote__picker" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option}
        type="button"
        disabled={disabled}
        aria-pressed={value === option}
        onClick={() => {
          if (!disabled) onChange(option);
        }}
      >
        {option}
      </button>
    ))}
  </div>
);

export const SendPanel = ({
  data,
  slot,
  expanded,
  act,
  onClose,
}: {
  data: ZadcoteData;
  slot: ZadcoteSlot;
  expanded: boolean;
  act: ZadcoteAct;
  onClose: () => void;
}) => {
  const id = useId();
  const [message, setMessage] = useState('');
  const [zads, setZads] = useState(1);
  const [bombs, setBombs] = useState(0);
  const [bombCaw, setBombCaw] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<Record<string, boolean>>({});
  const effectiveZads = bombs > 0 ? bombs : zads;
  const bombsAvailable =
    data.bomb_stock > 0 && data.bomb_cooldown_remaining <= 0;
  const overLimit = message.length > MESSAGE_MAX;
  const refs =
    bombs > 0
      ? []
      : data.payload_in_hand
          .filter(
            (item) =>
              selectedRefs[item.ref] &&
              item.w_class <= maxWeightForTier(effectiveZads),
          )
          .map((item) => item.ref);
  const refusedReason = (() => {
    if (!data.can_operate) return "Only the zadcote's faction may operate it.";
    if (slot.severed) return 'The zadlink is severed.';
    if (!slot.bonded) return 'No cage is bonded to this slot.';
    if (slot.in_flight) return 'A flight is already on this slot.';
    if (slot.cage_occupied) return 'That zadcage is already occupied.';
    if (slot.cage_has_payload)
      return 'Unclaimed parcels still sit in that cage.';
    if (data.flights >= data.flight_cap) return 'Too many flights in the air.';
    if (bombs > 0 && data.bomb_cooldown_remaining > 0)
      return `Bombs ready in ${formatCountdown(data.bomb_cooldown_remaining)}`;
    if (bombs > data.bomb_stock)
      return `The zadcote has only ${data.bomb_stock} bottlebombs stored.`;
    if (data.reserve < effectiveZads)
      return `Only ${data.reserve} zads remain in the cote.`;
    if (overLimit) return `Message exceeds ${MESSAGE_MAX} characters.`;
    return null;
  })();

  return (
    <section
      className="Zadcote__dispatch"
      hidden={!expanded}
      aria-labelledby={`${id}-title`}
    >
      <header>
        <h3 id={`${id}-title`}>Dispatch to {slot.label}</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="Zadcote__messageLabel">
        <label htmlFor={`${id}-message`}>Message</label>
        <span className={overLimit ? 'Zadcote__bad' : 'Zadcote__muted'}>
          {message.length} / {MESSAGE_MAX}
        </span>
      </div>
      <textarea
        id={`${id}-message`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        aria-invalid={overLimit}
      />
      <div className="Zadcote__cargo">
        <h4>Payload in hand</h4>
        {bombs > 0 ? (
          <p className="Zadcote__accent">
            Bombs are loaded - no other payload will fly with them.
          </p>
        ) : data.payload_in_hand.length === 0 ? (
          <p className="Zadcote__muted">
            Hold a parcel in your active hand to send it with the zad.
          </p>
        ) : (
          data.payload_in_hand.map((item) => {
            const tooHeavy = item.w_class > maxWeightForTier(effectiveZads);
            return (
              <label key={item.ref} className="Zadcote__parcel">
                <input
                  type="checkbox"
                  checked={!!selectedRefs[item.ref] && !tooHeavy}
                  disabled={tooHeavy || !data.can_operate}
                  onChange={() =>
                    setSelectedRefs((previous) => ({
                      ...previous,
                      [item.ref]: !previous[item.ref],
                    }))
                  }
                />
                <span>{item.name}</span>
                <span className={tooHeavy ? 'Zadcote__bad' : 'Zadcote__muted'}>
                  {item.w_class > maxWeightForTier(3)
                    ? 'Too heavy for any flight'
                    : tooHeavy
                      ? `${weightLabel(item.w_class)} - needs more zads`
                      : weightLabel(item.w_class)}
                </span>
              </label>
            );
          })
        )}
      </div>
      <div className="Zadcote__loadout">
        <div>
          <h4>Zads</h4>
          <Picker
            label="Zads"
            options={[1, 2, 3]}
            value={effectiveZads}
            onChange={setZads}
            disabled={bombs > 0 || !data.can_operate}
          />
          <p className="Zadcote__muted">
            {effectiveZads === 1
              ? '1 zad: tiny or small parcel.'
              : effectiveZads === 2
                ? '2 zads: pouch, helmet, or normal-sized item.'
                : '3 zads: bulky parcel, large container, or a great weapon.'}
          </p>
        </div>
        {(bombsAvailable || bombs > 0) && (
          <div>
            <h4>Bottlebombs</h4>
            <Picker
              label="Bottlebombs"
              options={[0, 1, 2, 3].filter(
                (count) =>
                  count === 0 ||
                  count === bombs ||
                  (bombsAvailable && count <= data.bomb_stock),
              )}
              value={bombs}
              onChange={setBombs}
              disabled={!data.can_operate}
            />
          </div>
        )}
      </div>
      {bombs > 0 && (
        <label className="Zadcote__caw">
          Bomb caw (optional, 40 chars)
          <input
            type="text"
            value={bombCaw}
            maxLength={40}
            placeholder="The zads will caw this before they drop. Leave blank for silence."
            onChange={(event) => setBombCaw(event.target.value)}
          />
        </label>
      )}
      <div className="Zadcote__send">
        <button
          type="button"
          disabled={!!refusedReason}
          title={refusedReason ?? 'Loose the zads'}
          onClick={() => {
            if (refusedReason) return;
            act('dispatch', {
              slot: slot.slot,
              bond_ref: slot.bond_ref,
              zads: effectiveZads,
              bombs,
              message,
              payload_refs: refs,
              bomb_caw: bombs > 0 ? bombCaw : '',
            });
            onClose();
          }}
        >
          Send
        </button>
        {refusedReason && <span className="Zadcote__bad">{refusedReason}</span>}
      </div>
    </section>
  );
};
