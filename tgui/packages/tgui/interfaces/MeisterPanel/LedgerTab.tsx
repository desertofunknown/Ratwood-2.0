import { useState } from 'react';

import { PaginatedLog } from './PaginatedLog';
import { type TabProps } from './types';

export const LedgerTab = ({ data, act }: TabProps) => {
  const personal = data.active_loan;
  const institutional = data.institutional_loans;
  const [repayAmounts, setRepayAmounts] = useState<Record<number, string>>({});

  return (
    <>
      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>My debts</h2></div>
        {!personal && <p className="MeisterPanel__empty">No outstanding debt.</p>}
        {!!personal && (
          <div className="MeisterPanel__loan">
            <div className="MeisterPanel__loanHeading">
              <strong>{personal.creditor}</strong>
              <span className="MeisterPanel__amount">{personal.remaining}m</span>
            </div>
            <div className="MeisterPanel__loanTerms">
              <span>Principal {personal.principal}m · {personal.interest_pct}%/day</span>
              <span className={personal.defaulted ? 'MeisterPanel__warning' : undefined}>
                {personal.defaulted ? 'Defaulted' : `Due in ~${personal.minutes_until_due} minutes`}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>Institutional ledger</h2></div>
        {!institutional.length && (
          <p className="MeisterPanel__empty">No loans under your authority.</p>
        )}
        {institutional.map((loan, i) => {
          const repayment = Number(repayAmounts[i] || '0');
          const repayDisabled = !Number.isInteger(repayment) || repayment < 1 || repayment > loan.remaining;
          return (
            <div key={i} className="MeisterPanel__loan">
              <div className="MeisterPanel__loanHeading">
                <div>
                  <strong>{loan.creditor_label}</strong>
                  {' — '}{loan.is_institutional ? 'Indenture to ' : 'Loan to '}
                  {loan.is_institutional ? loan.target_label : loan.debtor || 'unknown'}
                </div>
                <span className="MeisterPanel__amount">{loan.remaining}m</span>
              </div>
              <div className="MeisterPanel__loanTerms">
                <span>Principal {loan.principal}m · {loan.interest_pct}%/day</span>
                <span className={loan.defaulted ? 'MeisterPanel__warning' : undefined}>
                  {loan.defaulted ? 'Defaulted' : `Due in ~${loan.minutes_until_due} minutes`}
                </span>
              </div>
              {loan.is_institutional && (
                <div className="MeisterPanel__actions MeisterPanel__actions--end">
                  <label>
                    Repayment in mammon
                    <input
                      type="number"
                      min={1}
                      max={loan.remaining}
                      step={1}
                      value={repayAmounts[i] || ''}
                      onChange={(e) => setRepayAmounts({ ...repayAmounts, [i]: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={repayDisabled}
                    onClick={() => {
                      act('repay_indenture', {
                        fund_id: loan.target_id,
                        amount: repayment,
                      });
                      setRepayAmounts({ ...repayAmounts, [i]: '' });
                    }}
                  >
                    Repay
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="MeisterPanel__section">
        <div className="MeisterPanel__sectionTitle"><h2>Tally</h2></div>
        <div className="MeisterPanel__transactions">
          <PaginatedLog entries={data.personal_log} emptyMessage="Personal transaction history is not recorded." />
        </div>
      </section>
    </>
  );
};
