import { useState } from 'react';

import { type TabProps } from './types';

export const PollTaxTab = ({ data, act }: TabProps) => {
  const [days, setDays] = useState<string>('');
  const tax = data.poll_tax;
  const taxStatic = data.poll_tax_static;
  const taxUser = data.poll_tax_user;
  const numericDays = Number(days) || 0;

  const effectiveRate = tax.rate > 0 ? tax.rate : taxStatic.fallback_rate;
  const presumed = tax.rate <= 0;
  const capRemaining = taxStatic.max_advance_days - tax.advance_days_held;
  const affordable = Math.floor(data.account_balance / Math.max(1, effectiveRate));
  const maxDays = Math.min(capRemaining, affordable);

  let rateLine = `${tax.rate}m per day`;
  if (tax.exempt) {
    rateLine = 'Exempt by decree';
  } else if (tax.rate < 0) {
    rateLine = `Crown subsidises ${-tax.rate}m per day`;
  } else if (tax.rate === 0) {
    rateLine = `None levied (advance at presumed ${taxStatic.fallback_rate}m/day)`;
  }

  const advanceBlocked =
    !taxUser.category ||
    tax.exempt ||
    tax.rate < 0 ||
    capRemaining <= 0 ||
    affordable <= 0;
  const submitDisabled =
    advanceBlocked || !Number.isInteger(numericDays) ||
    numericDays < 1 || numericDays > maxDays;

  return (
    <section className="MeisterPanel__section">
      <div className="MeisterPanel__sectionTitle"><h2>Poll tax</h2></div>
      <dl className="MeisterPanel__entries">
        <div><dt>Class</dt><dd>{taxUser.category_label || 'No taxable class'}</dd></div>
        <div><dt>Rate</dt><dd>{rateLine}</dd></div>
        <div>
          <dt>Held in advance</dt>
          <dd>
            {tax.advance_days_held} day{tax.advance_days_held === 1 ? '' : 's'}
            {' '}(cap {taxStatic.max_advance_days})
          </dd>
        </div>
      </dl>

      {!!tax.exempt && <p className="MeisterPanel__help">Exempt; no advance needed.</p>}
      {advanceBlocked && !tax.exempt && (
        <p className="MeisterPanel__help">
          {!taxUser.category
            ? 'No taxable class registered; advance unavailable.'
            : tax.rate < 0
              ? 'Your class receives a Crown subsidy; no advance needed.'
              : capRemaining <= 0
                ? 'Advance paid to the allowed limit.'
                : 'Insufficient balance for a full day in advance.'}
        </p>
      )}

      {!advanceBlocked && (
        <>
          <div className="MeisterPanel__withdrawal">
            <label>
              Advance days
              <input
                type="number"
                min={1}
                max={maxDays}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <div className="MeisterPanel__total">
              <span>{presumed ? 'Presumed total' : 'Total'}</span>
              <strong>
                {Number.isInteger(numericDays) && numericDays >= 0
                  ? `${numericDays * effectiveRate}m` : '—'}
              </strong>
            </div>
            <button
              type="button"
              disabled={submitDisabled}
              onClick={() => {
                act('advance_poll_tax', { days: numericDays });
                setDays('');
              }}
            >
              Pay forward
            </button>
          </div>
          <p className="MeisterPanel__help">Enter 1–{maxDays} whole days.</p>
        </>
      )}
    </section>
  );
};
