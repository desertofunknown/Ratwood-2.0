import React from 'react';

import { type LedgerViewProps, projectEntry } from './model';

export function ReactView({
  page,
  draft,
  onDraft,
  onClear,
  onPage,
  onRefresh,
}: LedgerViewProps) {
  if (!page) {
    return (
      <p className="TithewoodSurface TreasuryLedger TreasuryLedger__loading">
        Opening the ledger...
      </p>
    );
  }

  return (
    <section className="TithewoodSurface TreasuryLedger">
      <h2 className="TreasuryLedger__title">
        Treasury Ledger <small>newest first</small>
      </h2>
      <div className="TreasuryLedger__toolbar">
        <label className="TreasuryLedger__search">
          Search{' '}
          <input
            className="TithewoodControl"
            type="search"
            value={draft}
            onInput={(event) => onDraft(event.currentTarget.value)}
            placeholder="Account name or reason..."
          />
        </label>
        {!!draft && (
          <button className="TithewoodControl" type="button" onClick={onClear}>
            Clear
          </button>
        )}
        <button className="TithewoodControl" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {page.entries.length === 0 ? (
        <p className="TreasuryLedger__empty">
          {page.filtered
            ? 'No ledger entries match that search.'
            : 'The ledger is empty.'}
        </p>
      ) : (
        <table
          className="TreasuryLedger__table"
          aria-label="Treasury Ledger entries"
        >
          <colgroup>
            <col className="TreasuryLedger__accountColumn" />
            <col className="TreasuryLedger__reasonColumn" />
            <col className="TreasuryLedger__amountColumn" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Reason</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {page.entries.map((entry, index) => {
              const row = projectEntry(entry);
              return (
                <tr key={index}>
                  <td>{row.account}</td>
                  <td>{row.reason}</td>
                  <td
                    className={`TreasuryLedger__amount TreasuryLedger__amount--${row.tone}`}
                  >
                    {row.amount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="TreasuryLedger__pagination">
        <button
          className="TithewoodControl"
          type="button"
          disabled={page.page <= 1}
          onClick={() => onPage(page.page - 1)}
        >
          Newer
        </button>
        <span>
          Page {page.page}, {page.shown} shown
        </span>
        <button
          className="TithewoodControl"
          type="button"
          disabled={!page.has_more}
          onClick={() => onPage(page.page + 1)}
        >
          Older
        </button>
      </div>
    </section>
  );
}
