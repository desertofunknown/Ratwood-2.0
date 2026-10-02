import { useEffect, useState } from 'react';

import { useBackend } from '../../backend';
import type { AtcLoanState, Data } from './types';

export const ATCLoanBanner = ({
  atc_loan: loan,
}: {
  atc_loan: AtcLoanState;
}) => {
  const { act, data } = useBackend<Data>();
  const [draft, setDraft] = useState(String(loan.min));
  const [confirmed, setConfirmed] = useState(false);
  const alderman = !!data.is_alderman_acting;
  const eligible =
    !!loan.can_view &&
    !!loan.available &&
    !loan.blocker &&
    !loan.arrears_consumed &&
    !alderman;
  const amount = Number(draft);
  const valid =
    draft.trim() !== '' &&
    Number.isInteger(amount) &&
    amount >= loan.min &&
    amount <= loan.max;
  // BYOND round() floors the positive debt after single-precision multiplication.
  const owed = valid
    ? Math.floor(
        Math.fround(
          Math.fround(amount) * Math.fround(1 + loan.interest_pct / 100),
        ),
      )
    : null;
  useEffect(
    () => setConfirmed(false),
    [draft, loan.min, loan.max, loan.interest_pct, eligible],
  );
  if (
    !loan.can_view ||
    (!loan.available && loan.loans_drawn === 0 && !loan.arrears_consumed)
  )
    return null;
  const apply = () => {
    if (!eligible || !valid) return;
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setConfirmed(false);
    act('take_atc_loan', { amount });
  };
  return (
    <details className="StewardDesk__notice">
      <summary>
        Company Clerk's Bench:{' '}
        {eligible
          ? `loans ${loan.min}–${loan.max}m at ${loan.interest_pct}% interest`
          : loan.arrears_consumed
            ? `${loan.outstanding}m outstanding`
            : loan.blocker || 'unavailable'}
      </summary>
      <p>Ferentian Trading Company — Company Clerk's Bench</p>
      {eligible ? (
        <p>
          The clerk receives applications for emergency loan of{' '}
          <strong>
            {loan.min}m to {loan.max}m
          </strong>{' '}
          on the Company's standing credit, at the customary{' '}
          <strong>{loan.interest_pct}% interest</strong> charged against the
          principal. The arrears grace stands forfeit on draw — should the Crown
          miss its next payroll, the realm enters sequestration without warning.
          Window closes on Day {loan.closed_day}.
        </p>
      ) : (
        <p>
          {alderman
            ? "The Alderman's writ does not extend to drawing loans against the Crown."
            : loan.blocker || 'The clerk is unavailable.'}
        </p>
      )}
      {!!loan.arrears_consumed && (
        <p className="StewardDesk__bad">
          Outstanding to the Company: <strong>{loan.outstanding}m</strong>. All
          inflow into the Crown's Purse is skimmed against the debt until it is
          settled. The Burghers' grace is forfeit; the next missed payroll skips
          arrears and goes straight to sequestration.
        </p>
      )}
      {loan.loans_drawn > 0 && (
        <p>Loans drawn this week: {loan.loans_drawn}.</p>
      )}
      {eligible && (
        <div className="StewardDesk__toolbar">
          <label>
            Draw{' '}
            <input
              type="number"
              aria-label="Company loan amount"
              value={draft}
              min={loan.min}
              max={loan.max}
              step={1}
              aria-invalid={!valid}
              onChange={(event) => setDraft(event.target.value)}
            />{' '}
            m
          </label>
          <span>
            {owed === null
              ? `Enter a whole amount from ${loan.min} to ${loan.max}m.`
              : `Owe ${owed}m`}
          </span>
          <button type="button" disabled={!valid} onClick={apply}>
            {confirmed ? `Confirm ${amount}m loan` : 'Approach the Clerk'}
          </button>
          {confirmed && (
            <button type="button" onClick={() => setConfirmed(false)}>
              Cancel loan
            </button>
          )}
        </div>
      )}
    </details>
  );
};
