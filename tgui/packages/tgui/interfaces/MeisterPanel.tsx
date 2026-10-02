import { useState } from 'react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { InstitutionalTab } from './MeisterPanel/InstitutionalTab';
import { LedgerTab } from './MeisterPanel/LedgerTab';
import { PatronageTab } from './MeisterPanel/PatronageTab';
import { PersonalTab } from './MeisterPanel/PersonalTab';
import { PollTaxTab } from './MeisterPanel/PollTaxTab';
import { type Data, type TabKey } from './MeisterPanel/types';

export const MeisterPanel = () => {
  const { data, act } = useBackend<Data>();
  const [tab, setTab] = useState<TabKey>('personal');
  const accessibleInstitutional = data.funds.some(
    (f) => f.can_issue || f.can_withdraw || f.can_view,
  );
  const accessiblePatronage = data.funds.some(
    (f) => f.has_patronage && data.patron_rosters[f.id]?.can_manage,
  );
  const activeTab =
    (tab === 'institutional' && !accessibleInstitutional) ||
    (tab === 'patronage' && !accessiblePatronage)
      ? 'personal'
      : tab;
  const tabs: { id: TabKey; label: string; visible: boolean }[] = [
    { id: 'personal', label: 'Personal', visible: true },
    { id: 'institutional', label: 'Institutional', visible: accessibleInstitutional },
    { id: 'patronage', label: 'Patronage', visible: accessiblePatronage },
    { id: 'polltax', label: 'Poll tax', visible: true },
    { id: 'ledger', label: 'Ledger', visible: true },
  ];

  return (
    <Window title="Nervelock" width={720} height={660}>
      <Window.Content scrollable className="KeepLedger MeisterPanel">
        <header className="MeisterPanel__header">
          <h1>Nervelock</h1>
          <span className="MeisterPanel__day">Day {data.day}</span>
          <div className="MeisterPanel__balance">
            <span>Account</span>
            <strong>{data.account_balance}<small>m</small></strong>
          </div>
        </header>
        <nav className="MeisterPanel__tabs" aria-label="Account sections">
          {tabs.filter((entry) => entry.visible).map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={activeTab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <main className="MeisterPanel__body">
          {activeTab === 'personal' && <PersonalTab data={data} act={act} />}
          {activeTab === 'institutional' && accessibleInstitutional && (
            <InstitutionalTab data={data} act={act} />
          )}
          {activeTab === 'patronage' && accessiblePatronage && (
            <PatronageTab data={data} act={act} />
          )}
          {activeTab === 'polltax' && <PollTaxTab data={data} act={act} />}
          {activeTab === 'ledger' && <LedgerTab data={data} act={act} />}
        </main>
      </Window.Content>
    </Window>
  );
};
