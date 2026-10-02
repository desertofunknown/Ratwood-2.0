import { useEffect, useId, useState } from 'react';

import { formatCountdown, maxWeightForTier, weightLabel } from './types';
import type { ZadcageAct, ZadcageData } from './types';

export const OccupancyPanel = ({
  data,
  act,
}: {
  data: ZadcageData;
  act: ZadcageAct;
}) => {
  const id = useId();
  const capacity = data.capacity ?? 1;
  const serverReply = data.reply_message ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const message = draft ?? serverReply;
  const dirty = message !== serverReply;
  const overLimit = message.length > 500;
  const tierMax = maxWeightForTier(capacity);
  const validRef = data.payload_in_hand.some(
    (item) => item.ref === selectedRef && (item.w_class ?? 0) <= tierMax,
  )
    ? selectedRef
    : null;
  const canSend =
    data.occupied &&
    !!data.flight_ref &&
    (data.time_remaining ?? 0) > 0 &&
    !overLimit;

  useEffect(() => {
    if (draft === serverReply) setDraft(null);
  }, [draft, serverReply]);
  useEffect(() => {
    if (selectedRef && !validRef) setSelectedRef(null);
  }, [selectedRef, validRef]);

  return (
    <section className="Zadcage__occupancy" aria-labelledby={`${id}-heading`}>
      <header>
        <div>
          <h2 id={`${id}-heading`}>A flight waits in the cage</h2>
          <p className="Zadcage__muted">
            Capacity for return: {capacity} {capacity === 1 ? 'zad' : 'zads'}
          </p>
        </div>
        <strong className={data.warning_tail ? 'Zadcage__bad' : undefined}>
          {formatCountdown(data.time_remaining ?? 0)}
        </strong>
      </header>
      {!!data.warning_tail && (
        <p className="Zadcage__warning">
          Auto-depart imminent. Auto-depart will NOT carry your reply or
          package.
        </p>
      )}
      <div className="Zadcage__replyHeading">
        <label htmlFor={`${id}-reply`}>Reply</label>
        <span className={overLimit ? 'Zadcage__bad' : 'Zadcage__muted'}>
          {message.length} / 500
        </span>
      </div>
      <textarea
        id={`${id}-reply`}
        value={message}
        maxLength={500}
        rows={3}
        placeholder="A few words back..."
        aria-invalid={overLimit}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="Zadcage__save">
        <button
          type="button"
          disabled={!dirty || !canSend}
          onClick={() => {
            if (dirty && canSend)
              act('set_reply_message', {
                message,
                flight_ref: data.flight_ref,
              });
          }}
        >
          Set
        </button>
      </div>
      <h3>Return Package</h3>
      <p className="Zadcage__muted">
        Hold a parcel in your active hand to send it back.
        {capacity === 1
          ? ' This return can carry a tiny or small item.'
          : capacity === 2
            ? ' This return can carry up to a normal-sized item (helmet, pouch).'
            : ' This return can carry a bulky parcel or large container.'}
      </p>
      {data.payload_in_hand.length === 0 ? (
        <p className="Zadcage__empty">
          Empty-handed - hold something to offer it as the return parcel.
        </p>
      ) : (
        data.payload_in_hand.map((item) => {
          const weight = item.w_class ?? 0;
          const tooHeavy = weight > tierMax;
          const checked = validRef === item.ref;
          return (
            <label key={item.ref} className="Zadcage__parcel">
              <input
                type="checkbox"
                checked={checked}
                disabled={tooHeavy}
                onChange={() => setSelectedRef(checked ? null : item.ref)}
              />
              <span>{item.name}</span>
              <span className={tooHeavy ? 'Zadcage__bad' : 'Zadcage__muted'}>
                {tooHeavy
                  ? `${weightLabel(weight)} - too heavy for ${capacity} zad${capacity === 1 ? '' : 's'}`
                  : weightLabel(weight)}
              </span>
            </label>
          );
        })
      )}
      <div className="Zadcage__send">
        <button
          type="button"
          disabled={!canSend}
          onClick={() => {
            if (canSend)
              act('send_reply', {
                message,
                payload_ref: validRef ?? '',
                flight_ref: data.flight_ref,
              });
          }}
        >
          Send Reply
        </button>
        {overLimit && (
          <span className="Zadcage__bad">Message exceeds 500 characters.</span>
        )}
      </div>
    </section>
  );
};
