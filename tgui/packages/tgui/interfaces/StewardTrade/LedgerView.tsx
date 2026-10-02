import { useEffect, useState } from 'react';

import { useBackend } from '../../backend';
import type { Data, LedgerEntry } from './types';

const partyFor = (entry: LedgerEntry) =>
  entry.kind === 'mint'
    ? entry.to
    : entry.kind === 'burn'
      ? entry.from
      : `${entry.from} → ${entry.to}`;

export const LedgerView = ({ data }: { data: Data }) => {
  const { act } = useBackend<Data>();
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(
      () => act('ledger_filter', { filter: draft }),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [draft, touched, act]);
  const search = (value: string) => {
    setTouched(true);
    setDraft(value);
  };
  const page = data.ledger_page;
  if (!page) return <p className="StewardDesk__muted">Opening the ledger...</p>;
  return (
    <section className="StewardDesk__ledger">
      <h2>
        Treasury Ledger <small>newest first</small>
      </h2>
      <div className="StewardDesk__toolbar">
        <label className="StewardDesk__search">
          Search{' '}
          <input
            type="search"
            value={draft}
            onChange={(event) => search(event.target.value)}
            placeholder="Account name or reason..."
          />
        </label>
        {!!draft && (
          <button type="button" onClick={() => search('')}>
            Clear
          </button>
        )}
        <button type="button" onClick={() => act('ledger_refresh')}>
          Refresh
        </button>
      </div>
      {page.entries.length === 0 ? (
        <p className="StewardDesk__muted">
          {page.filtered
            ? 'No ledger entries match that search.'
            : 'The ledger is empty.'}
        </p>
      ) : (
        <table className="StewardDesk__ledgerTable">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Reason</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {page.entries.map((entry, index) => (
              <tr key={index}>
                <td>{partyFor(entry)}</td>
                <td>{entry.reason}</td>
                <td
                  className={
                    entry.kind === 'mint'
                      ? 'StewardDesk__good'
                      : entry.kind === 'burn'
                        ? 'StewardDesk__bad'
                        : undefined
                  }
                >
                  {entry.kind === 'mint'
                    ? '+'
                    : entry.kind === 'burn'
                      ? '−'
                      : ''}
                  {entry.amount}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="StewardDesk__pagination">
        <button
          type="button"
          disabled={page.page <= 1}
          onClick={() => act('ledger_page', { page: page.page - 1 })}
        >
          Newer
        </button>
        <span>
          Page {page.page}, {page.shown} shown
        </span>
        <button
          type="button"
          disabled={!page.has_more}
          onClick={() => act('ledger_page', { page: page.page + 1 })}
        >
          Older
        </button>
      </div>
    </section>
  );
};
