import { useState } from 'react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { CulturalStockTab } from './Goldface/CulturalStock/CulturalStockTab';
import { HarborTab } from './Goldface/Harbor/HarborTab';
import { LedgerTab } from './Goldface/Ledger/LedgerTab';
import { MammonRow } from './Goldface/MammonRow';
import { ManagementTab } from './Goldface/Management/ManagementTab';
import { MarketTab } from './Goldface/Market/MarketTab';
import { TariffHeader } from './Goldface/TariffHeader';
import type { VendingData } from './Goldface/types';
import { VendingPanel } from './Goldface/VendingPanel';

type GoldfaceTab = 'goods' | 'cultural' | 'harbor' | 'market' | 'management' | 'ledger';

export const Goldface = () => {
  const { act, data } = useBackend<VendingData>();
  const [tab, setTab] = useState<GoldfaceTab>('goods');
  const canRead = !!data.can_read;
  const isPublic = !!data.is_public;
  const isProprietor = !!data.is_proprietor;
  const isAgent = !!data.is_agent;
  const canSeeMerchantTabs = !!data.is_command_center && isProprietor;
  const canSeeHarborTabs = !!data.is_command_center && (isProprietor || isAgent);
  const culturalStock = data.harbor?.cultural_stock ?? [];
  const tabs: { id: GoldfaceTab; label: string }[] = [{ id: 'goods', label: 'Goods' }];
  if (canSeeHarborTabs) {
    tabs.push({ id: 'cultural', label: 'Cultural stock' }, { id: 'harbor', label: 'Harbor' });
  }
  if (canSeeMerchantTabs) {
    tabs.push({ id: 'market', label: 'Market' }, { id: 'management', label: 'Management' }, { id: 'ledger', label: 'Ledger' });
  }
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'goods';

  return (
    <Window width={920} height={760}>
      <Window.Content className="KeepLedger Goldface" scrollable>
        <header className="Goldface__header">
          <TariffHeader
            motto={data.motto}
            canRead={canRead}
            tariffRatePct={data.tariff_rate_pct}
            tariffPaid={data.tariff_paid}
            tariffEvaded={data.tariff_evaded}
            isProprietor={isProprietor}
            dodging={!!data.dodging}
            publicMarginPct={data.public_margin_pct}
            publicMarginLabel={data.public_margin_label}
          />
          <div className="Goldface__controls">
            <MammonRow budget={data.budget} canRead={canRead} isProprietor={isProprietor} isPublic={isPublic} act={act} />
            <button type="button" onClick={() => act('help')}>Trade guide</button>
          </div>
        </header>
        {tabs.length > 1 && (
          <nav className="Goldface__tabs" aria-label="Merchant sections">
            {tabs.map((item) => (
              <button key={item.id} type="button" aria-pressed={activeTab === item.id} onClick={() => setTab(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
        )}
        {activeTab === 'goods' && <VendingPanel data={data} act={act} />}
        {activeTab === 'cultural' && canSeeHarborTabs && (
          <CulturalStockTab
            stock={culturalStock}
            catalogs={data.harbor?.catalogs}
            kinship={data.harbor?.kinship}
            budget={data.budget}
            isAgent={isAgent}
            act={act}
          />
        )}
        {activeTab === 'harbor' && canSeeHarborTabs && (
          <HarborTab
            harbor={data.harbor}
            budget={data.budget}
            isAgent={isAgent}
            act={act}
          />
        )}
        {activeTab === 'market' && canSeeMerchantTabs && (
          <MarketTab harbor={data.harbor} />
        )}
        {activeTab === 'management' && canSeeMerchantTabs && (
          <ManagementTab harbor={data.harbor} act={act} />
        )}
        {activeTab === 'ledger' && canSeeMerchantTabs && (
          <LedgerTab harbor={data.harbor} />
        )}
      </Window.Content>
    </Window>
  );
};

