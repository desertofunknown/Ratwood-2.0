import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import type { Data } from './types';

export const RoyalCustomPanel = () => {
  const { act, data } = useBackend<Data>();
  const current = data.royal_custom_margin;
  const [draft, setDraft] = useState(String(current));
  const previousMargin = useRef(current);
  useEffect(() => {
    const previous = previousMargin.current;
    previousMargin.current = current;
    setDraft((value) =>
      value.trim() !== '' && Number(value) === previous ? String(current) : value,
    );
  }, [current]);
  const unlocked = !!data.royal_custom_unlocked;
  const aldermanActing = !!data.is_alderman_acting;
  const margin = Number(draft);
  const valid =
    draft.trim() !== '' &&
    Number.isInteger(margin) &&
    margin >= 0 &&
    margin <= 500;
  const canSet = unlocked && !aldermanActing && valid && margin !== current;
  return (
    <section className="StewardControl">
      <h2>Royal Custom Charter</h2>
      {!unlocked ? (
        <p>
          Locked - volume <strong>{data.royal_custom_volume}m</strong> of{' '}
          <strong>{data.royal_custom_threshold}m</strong>
        </p>
      ) : (
        <>
          <div className="StewardControl__rate">
            <span>
              Invoked. Import margin <strong>{current}%</strong>
            </span>
            <label>
              Set margin %
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={draft}
                disabled={aldermanActing}
                aria-label="Royal Custom margin"
                aria-invalid={!valid}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!canSet}
              onClick={() => {
                if (canSet) act('set_royal_custom_margin', { value: margin });
              }}
            >
              Set
            </button>
          </div>
          {aldermanActing && (
            <p>
              Reserved to the Steward's office. The Alderman's writ does not
              extend to Royal Custom.
            </p>
          )}
        </>
      )}
      <p>
        Invoked once the volume threshold is reached; Import surcharges flow
        into the Crown&apos;s purse thereafter.
      </p>
    </section>
  );
};
