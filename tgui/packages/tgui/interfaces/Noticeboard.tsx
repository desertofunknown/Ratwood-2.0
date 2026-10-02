import { useState } from 'react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { AvisaTab } from './Noticeboard/AvisaTab';
import { PostingsTab } from './Noticeboard/PostingsTab';
import { RosterTab } from './Noticeboard/RosterTab';
import { type NoticeboardData, type TabKey } from './Noticeboard/types';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'postings', label: 'Postings' },
  { key: 'avisa', label: 'The Avisa' },
  { key: 'roster', label: 'Mercenary Roster' },
];

export const Noticeboard = () => {
  const { data, act } = useBackend<NoticeboardData>();
  const [tab, setTab] = useState<TabKey>('postings');

  return (
    <Window title="Noticeboard" width={1000} height={760} theme="parchment">
      <Window.Content scrollable>
        <div className="RealmNoticeboard">
          <header className="RealmNoticeboard__heading">
            <div>
              <h1>The Notice Board</h1>
              <p>
                of {data.realm_name || 'the realm'} — postings of the realm and
                her commons
              </p>
            </div>
            <button
              type="button"
              title="Refresh market data (5s cooldown)"
              onClick={() => act('refresh_market')}
            >
              Refresh market
            </button>
          </header>
          <nav className="RealmNoticeboard__tabs" aria-label="Noticeboard">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'postings' && <PostingsTab data={data} act={act} />}
          {tab === 'avisa' && <AvisaTab data={data} act={act} />}
          {tab === 'roster' && <RosterTab data={data} act={act} />}
        </div>
      </Window.Content>
    </Window>
  );
};
