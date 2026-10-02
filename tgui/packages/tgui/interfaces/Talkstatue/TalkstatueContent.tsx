import { useState } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../../backend';

export type RosterEntry = {
  key: string;
  name: string;
  status: string;
  message: string;
  advjob: string;
  nom_de_guerre: string;
};

export type TalkstatueData = {
  is_merc: BooleanLike;
  is_adventurer: BooleanLike;
  is_wretch: BooleanLike;
  is_bathhouse: BooleanLike;
  my_key: string;
  message_char_limit: number;
  merc_status_options: string[];
  adv_status_options: string[];
  wretch_status_options: string[];
  mercenaries: RosterEntry[];
  adventurers: RosterEntry[];
  wretches: RosterEntry[];
};

type Tab = 'mercs' | 'adventurers' | 'wretches';

export const TalkstatueContent = () => {
  const { data, act } = useBackend<TalkstatueData>();
  const [tab, setTab] = useState<Tab>('mercs');
  const wretchVisible = !!data.is_wretch || !!data.is_bathhouse;
  const activeTab = tab === 'wretches' && !wretchVisible ? 'mercs' : tab;
  const registries = {
    mercs: {
      entries: data.mercenaries,
      mayRegister: !!data.is_merc,
      options: data.merc_status_options,
      setStatus: 'set_merc_status',
      editMessage: 'edit_merc_message',
      label: 'Mercenary registry',
      title: 'Mercenary Roster',
      empty: 'No mercenaries have registered.',
    },
    adventurers: {
      entries: data.adventurers,
      mayRegister: !!data.is_adventurer,
      options: data.adv_status_options,
      setStatus: 'set_adv_status',
      editMessage: 'edit_adv_message',
      label: 'Adventurer Hall registry',
      title: 'Adventurer Roster',
      empty: 'No adventurers have registered.',
    },
    wretches: {
      entries: data.wretches,
      mayRegister: !!data.is_wretch,
      options: data.wretch_status_options,
      setStatus: 'set_wretch_status',
      editMessage: 'edit_wretch_message',
      label: 'Wretch registry',
      title: 'Wretch Roster',
      empty: 'No wretches have registered.',
    },
  };
  const registry = registries[activeTab];
  const own = registry.entries.find((entry) => entry.key === data.my_key);
  const entries = [...registry.entries].sort(
    (a, b) =>
      (activeTab === 'adventurers'
        ? Number(b.status === 'Available') - Number(a.status === 'Available')
        : 0) ||
      a.status.localeCompare(b.status) ||
      a.name.localeCompare(b.name),
  );

  return (
    <main className="Talkstatue">
      <p className="Talkstatue__intro">
        The stone speaks in your name to those who pass.
      </p>
      <nav aria-label="Statue rosters" className="Talkstatue__tabs">
        <button
          type="button"
          aria-pressed={activeTab === 'mercs'}
          onClick={() => setTab('mercs')}
        >
          Mercenaries ({data.mercenaries.length})
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'adventurers'}
          onClick={() => setTab('adventurers')}
        >
          Adventurers ({data.adventurers.length})
        </button>
        {wretchVisible && (
          <button
            type="button"
            aria-pressed={activeTab === 'wretches'}
            onClick={() => setTab('wretches')}
          >
            Wretches ({data.wretches.length})
          </button>
        )}
      </nav>
      {registry.mayRegister && (
        <section className="Talkstatue__registry" aria-label={registry.label}>
          <h2>{registry.label}</h2>
          <div className="Talkstatue__controls">
            <label>
              Status
              <select
                value={own?.status || ''}
                onChange={(event) =>
                  act(registry.setStatus, { status: event.currentTarget.value })
                }
              >
                {!own && (
                  <option value="" disabled>
                    Not Registered
                  </option>
                )}
                {registry.options.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => act(registry.editMessage)}>
              Edit Message
            </button>
            {activeTab === 'adventurers' && own && (
              <button type="button" onClick={() => act('leave_adv')}>
                Take Myself Off
              </button>
            )}
            {activeTab === 'wretches' && (
              <button type="button" onClick={() => act('edit_wretch_nom')}>
                Nom de Guerre
              </button>
            )}
          </div>
          {!!own?.message && (
            <p className="Talkstatue__message">&ldquo;{own.message}&rdquo;</p>
          )}
        </section>
      )}
      {activeTab === 'mercs' && (
        <div className="Talkstatue__contacts">
          <button type="button" onClick={() => act('contact_merc')}>
            Contact a Mercenary
          </button>
          <button type="button" onClick={() => act('broadcast_mercs')}>
            Broadcast to All
          </button>
        </div>
      )}
      {activeTab === 'adventurers' && (
        <div className="Talkstatue__contacts">
          <p>
            Adventurers post here when seeking work. Anyone may send them a
            single message; they cannot reach you back through this stone.
          </p>
          <button type="button" onClick={() => act('pick_adventurer')}>
            Contact an Adventurer
          </button>
        </div>
      )}
      {activeTab === 'wretches' && (
        <div className="Talkstatue__contacts">
          <p>
            This roster is visible only to wretches and the bathhouse staff. The
            bathhouse may reach a wretch under their chosen nom de guerre for
            discreet work.
          </p>
          {!!data.is_bathhouse && (
            <button type="button" onClick={() => act('pick_wretch')}>
              Contact a Wretch
            </button>
          )}
        </div>
      )}
      <h2>
        {registry.title} <span>({entries.length})</span>
      </h2>
      {entries.length === 0 ? (
        <p className="Talkstatue__empty">{registry.empty}</p>
      ) : (
        <ul className="Talkstatue__roster">
          {entries.map((entry) => {
            const mayContact =
              entry.status !== 'Do not Disturb' &&
              (activeTab === 'adventurers' ||
                (activeTab === 'wretches' &&
                  !!data.is_bathhouse &&
                  entry.key !== data.my_key));
            return (
              <li key={entry.key}>
                <div className="Talkstatue__identity">
                  <h3>{entry.name}</h3>
                  {activeTab !== 'wretches' && !!entry.advjob && (
                    <span>{entry.advjob}</span>
                  )}
                </div>
                {!!entry.message && (
                  <p className="Talkstatue__message">
                    &ldquo;{entry.message}&rdquo;
                  </p>
                )}
                <div className="Talkstatue__actions">
                  <span
                    className={
                      entry.status === 'Do not Disturb'
                        ? 'Talkstatue__unavailable'
                        : entry.status === 'Available'
                          ? 'Talkstatue__available'
                          : ''
                    }
                  >
                    {entry.status}
                  </span>
                  {mayContact && (
                    <button
                      type="button"
                      aria-label={`Message: ${entry.name}`}
                      onClick={() =>
                        act(
                          activeTab === 'adventurers'
                            ? 'contact_adventurer'
                            : 'contact_wretch',
                          { key: entry.key },
                        )
                      }
                    >
                      Message
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
};
