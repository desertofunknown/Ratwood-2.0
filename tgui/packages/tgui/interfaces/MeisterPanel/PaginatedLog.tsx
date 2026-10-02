import { useState } from 'react';

import { type LogEntry } from './types';

const PAGE_SIZE = 20;

type Props = {
  entries: LogEntry[];
  emptyMessage?: string;
};

export const PaginatedLog = ({ entries, emptyMessage = 'No transactions on record.' }: Props) => {
  const [page, setPage] = useState<number>(0);
  if (!entries.length) {
    return <p className="MeisterPanel__empty">{emptyMessage}</p>;
  }
  const total = entries.length;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const safePage = Math.min(page, lastPage);
  const start = safePage * PAGE_SIZE;
  const slice = entries.slice(start, start + PAGE_SIZE);

  return (
    <>
      <table className="MeisterPanel__tally">
        <thead><tr><th scope="col">Amount</th><th scope="col">Entry</th></tr></thead>
        <tbody>
          {slice.map((entry, i) => {
            const isIn = entry.direction === 'in';
            const isOut = entry.direction === 'out';
            const sign = isIn ? '+' : isOut ? '-' : '';
            const preposition = isIn ? 'from ' : isOut ? 'to ' : '';
            return (
              <tr key={start + i}>
                <td className={isIn ? 'MeisterPanel__good' : isOut ? 'MeisterPanel__warning' : undefined}>{sign}{entry.amount}m</td>
                <td>
                  {!!entry.counterparty && <span>{preposition}<b>{entry.counterparty}</b>{!!entry.reason && ' · '}</span>}
                  {!!entry.reason && <span className="MeisterPanel__muted">{entry.reason}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lastPage > 0 && (
        <nav className="MeisterPanel__pagination" aria-label="Transaction pages">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Newer</button>
          <span>{start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}</span>
          <button type="button" disabled={safePage >= lastPage} onClick={() => setPage(safePage + 1)}>Older</button>
        </nav>
      )}
    </>
  );
};
