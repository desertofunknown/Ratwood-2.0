import { useState } from 'react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { BrowseTab } from './Commissioner/BrowseTab';
import { ConfigPanel } from './Commissioner/ConfigPanel';
import { ManifestTab } from './Commissioner/ManifestTab';
import { OrdersTab } from './Commissioner/OrdersTab';
import type { CommissionerData } from './Commissioner/types';
import { SERIF } from './common/parchment';

type CommissionerTab = 'browse' | 'manifest' | 'orders' | 'config';

export const Commissioner = () => {
  const { act, data } = useBackend<CommissionerData>();
  const [tab, setTab] = useState<CommissionerTab>('browse');
  const canRead = !!data.can_read;
  const isGuildmaster = !!data.is_guildmaster;
  const activeTab = tab === 'config' && !isGuildmaster ? 'browse' : tab;
  const tabs: { id: CommissionerTab; label: string; count?: number }[] = [
    { id: 'browse', label: 'Catalogue', count: data.catalog.length },
    { id: 'manifest', label: 'Your manifest', count: data.my_manifest_items },
    { id: 'orders', label: 'Posted orders', count: data.orders.length },
  ];
  if (isGuildmaster) tabs.push({ id: 'config', label: 'Guild settings' });

  return (
    <Window width={960} height={760}>
      <Window.Content className="KeepLedger Commissioner">
        <div className="Commissioner__folio" style={{ fontFamily: SERIF }}>
          <header className="Commissioner__header">
            <h1>The Commissioner</h1>
            <span className={`Commissioner__state ${data.locked ? '' : 'Commissioner__state--closed'}`}>
              {data.locked ? 'Open for commissions' : 'Closed for guild adjustments'}
            </span>
            <div className="Commissioner__balances">
              <span>Escrow held <strong>{data.budget}m</strong></span>
              <span>Your deposit <strong>{data.my_deposit}m</strong></span>
            </div>
          </header>
          <details className="Commissioner__help">
            <summary>Deposits and escrow</summary>
            <p>Insert coins into the machine to deposit. Posted coin stays in escrow until the work is settled.</p>
          </details>
          <nav className="Commissioner__tabs" aria-label="Commission ledger pages">
            {tabs.map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeTab === id}
                onClick={() => setTab(id)}
              >
                {label}{count !== undefined && <span className="Commissioner__tabCount">{count}</span>}
              </button>
            ))}
          </nav>
          <div className={`Commissioner__page ${activeTab === 'browse' ? 'Commissioner__page--browse' : ''}`} tabIndex={activeTab === 'browse' ? -1 : 0}>
            {activeTab === 'browse' && <BrowseTab data={data} act={act} canRead={canRead} />}
            {activeTab === 'manifest' && <fieldset className="Commissioner__actions" disabled={!data.locked}><ManifestTab data={data} act={act} canRead={canRead} /></fieldset>}
            {activeTab === 'orders' && <fieldset className="Commissioner__actions" disabled={!data.locked}><OrdersTab data={data} act={act} canRead={canRead} /></fieldset>}
            {activeTab === 'config' && isGuildmaster && <ConfigPanel data={data} act={act} />}
          </div>
        </div>
      </Window.Content>
    </Window>
  );
};
