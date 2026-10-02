import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../../backend';

export type AdvertEntry = {
  key: string;
  name: string;
  status: string;
  message: string;
  advjob: string;
};

export type RosewallData = {
  is_bathhouse: BooleanLike;
  my_key: string;
  message_char_limit: number;
  status_options: string[];
  adverts: AdvertEntry[];
};

const statusOrder = (status: string) =>
  status === 'Available' ? 0 : status === 'Hired' ? 1 : 2;

const statusClass = (status: string) =>
  status === 'Available'
    ? 'Rosewall__available'
    : status === 'Hired'
      ? 'Rosewall__hired'
      : status === 'Do not Disturb'
        ? 'Rosewall__unavailable'
        : '';

export const RosewallContent = () => {
  const { data, act } = useBackend<RosewallData>();
  const myEntry = data.adverts.find((entry) => entry.key === data.my_key);
  const adverts = [...data.adverts].sort(
    (a, b) =>
      statusOrder(a.status) - statusOrder(b.status) ||
      a.name.localeCompare(b.name),
  );

  return (
    <main className="Rosewall">
      <header>
        <h1>The Rosewall</h1>
        <p>
          Perfumed slips pinned by the bathhouse&apos;s workers. Peruse, and
          send an offer.
        </p>
      </header>
      {!!data.is_bathhouse && (
        <section className="Rosewall__registry" aria-label="Bathhouse registry">
          <h2>Bathhouse registry</h2>
          <div className="Rosewall__controls">
            <label>
              Status
              <select
                value={myEntry?.status || ''}
                onChange={(event) =>
                  act('set_status', { status: event.currentTarget.value })
                }
              >
                {!myEntry && (
                  <option value="" disabled>
                    Not Pinned
                  </option>
                )}
                {data.status_options.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => act('edit_advert')}>
              {myEntry ? 'Edit Advert' : 'Pin an Advert'}
            </button>
            {myEntry && (
              <button type="button" onClick={() => act('remove_advert')}>
                Take Down
              </button>
            )}
          </div>
          {!!myEntry?.message && (
            <p className="Rosewall__message">&ldquo;{myEntry.message}&rdquo;</p>
          )}
        </section>
      )}
      <h2 className="Rosewall__count">
        Pinned Adverts <span>({adverts.length})</span>
      </h2>
      {adverts.length === 0 ? (
        <p className="Rosewall__empty">No adverts have been pinned.</p>
      ) : (
        <ul className="Rosewall__adverts">
          {adverts.map((entry) => (
            <li key={entry.key}>
              <div className="Rosewall__identity">
                <h3>{entry.name}</h3>
                {entry.advjob && <span>{entry.advjob}</span>}
              </div>
              {entry.message && (
                <p className="Rosewall__message">
                  &ldquo;{entry.message}&rdquo;
                </p>
              )}
              <div className="Rosewall__actions">
                <span
                  className={`Rosewall__status ${statusClass(entry.status)}`}
                >
                  {entry.status}
                </span>
                <button
                  type="button"
                  aria-label={`Examine Headshot: ${entry.name}`}
                  onClick={() => act('examine_headshot', { key: entry.key })}
                >
                  Examine Headshot
                </button>
                {entry.key !== data.my_key &&
                  entry.status !== 'Do not Disturb' && (
                    <button
                      type="button"
                      aria-label={`Send Offer: ${entry.name}`}
                      onClick={() => act('send_offer', { key: entry.key })}
                    >
                      Send Offer
                    </button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
