import type { MailEntry } from './types';

const MailColumn = ({
  title,
  entries,
}: {
  title: string;
  entries: MailEntry[];
}) => {
  const occurrences = new Map<string, number>();
  return (
    <section className="Zadcote__mailColumn" aria-label={title}>
      <h2>
        {title} ({entries.length})
      </h2>
      {entries.length === 0 ? (
        <p className="Zadcote__muted">Nothing yet.</p>
      ) : (
        entries.map((entry) => {
          // Entries have no server ID. Content keys keep a new arrival from inheriting an open message.
          const signature = JSON.stringify(entry);
          const occurrence = occurrences.get(signature) ?? 0;
          occurrences.set(signature, occurrence + 1);
          const zads = entry.zads_used ?? 0;
          const verb =
            entry.kind === 'returned'
              ? 'Returned'
              : entry.summoned
                ? 'Summoned'
                : 'Sent';
          return (
            <article
              className="Zadcote__mailEntry"
              key={`${signature}-${occurrence}`}
            >
              <header>
                <strong>
                  #{entry.slot} {entry.sender}
                </strong>
                <time>{entry.stamp}</time>
              </header>
              {zads > 0 && (
                <p>
                  {verb}: {zads} zad{zads === 1 ? '' : 's'}
                </p>
              )}
              {entry.items?.length > 0 && (
                <p>
                  {entry.kind === 'sent' ? 'Carried' : 'Brought'}:{' '}
                  {entry.items.join(', ')}
                </p>
              )}
              {entry.kind === 'sent' && (entry.bombs ?? 0) > 0 && (
                <p className="Zadcote__bad">
                  {entry.bombs} bottlebomb{entry.bombs === 1 ? '' : 's'}{' '}
                  attached
                </p>
              )}
              {entry.kind === 'returned' && (entry.lost ?? 0) > 0 && (
                <p className="Zadcote__bad">
                  {entry.lost} of {entry.zads_used} zad
                  {entry.zads_used === 1 ? '' : 's'} lost to exhaustion
                </p>
              )}
              {!!entry.message && (
                <details>
                  <summary>Message</summary>
                  <blockquote>“{entry.message}”</blockquote>
                </details>
              )}
            </article>
          );
        })
      )}
    </section>
  );
};

export const MailLog = ({ entries }: { entries: MailEntry[] }) => (
  <div className="Zadcote__mailLog">
    <MailColumn
      title="SENT"
      entries={entries.filter((entry) => entry.kind === 'sent')}
    />
    <MailColumn
      title="RECEIVED"
      entries={entries.filter((entry) => entry.kind === 'returned')}
    />
  </div>
);
