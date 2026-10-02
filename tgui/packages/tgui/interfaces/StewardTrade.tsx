import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import { AdvancedView } from './StewardTrade/AdvancedView';
import { ArrearsBanner } from './StewardTrade/ArrearsBanner';
import { ATCLoanBanner } from './StewardTrade/ATCLoanBanner';
import { AutoImportView } from './StewardTrade/AutoImportView';
import { BanditryBanner } from './StewardTrade/BanditryBanner';
import { BlockadeBanner } from './StewardTrade/BlockadeBanner';
import { EventsBanner } from './StewardTrade/EventsBanner';
import { LedgerView } from './StewardTrade/LedgerView';
import { MarketView } from './StewardTrade/MarketView';
import { OrdersView } from './StewardTrade/OrdersView';
import { PetitionView } from './StewardTrade/PetitionView';
import { RegionsView } from './StewardTrade/RegionsView';
import { RoyalCustomPanel } from './StewardTrade/RoyalCustomPanel';
import { SequesteredOverlay } from './StewardTrade/SequesteredOverlay';
import { SequestrationBanner } from './StewardTrade/SequestrationBanner';
import { TabBar } from './StewardTrade/TabBar';
import { TradeModal, type TradeModalRequest } from './StewardTrade/TradeModal';
import type { Data, TabKey } from './StewardTrade/types';

export const StewardTrade = () => {
  const { data, act } = useBackend<Data>();
  const [tab, setTab] = useState<TabKey>('orders');
  const bodyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);
  const [tradeRequest, setTradeRequest] = useState<TradeModalRequest | null>(
    null,
  );
  useEffect(() => {
    if (tab === 'ledger') {
      act('ledger_open');
      return () => act('ledger_close');
    }
  }, [tab, act]);
  const warrant = data.alderman_warrant;
  const net = data.expected_rural_revenue - data.expected_wage_outlay;
  return (
    <Window title="Market Scroll" width={860} height={820} theme="parchment">
      <Window.Content fitted className="StewardDesk">
        <header className="StewardDesk__heading">
          <div className="StewardDesk__title">
            <h1>Market &amp; Stockpile</h1>
            <span>Day {data.day}</span>
            <span>
              Crown's Purse <strong>{data.treasury}m</strong>
            </span>
          </div>
          <p>
            At dawn: +{data.expected_rural_revenue}m rural tax, −
            {data.expected_wage_outlay}m wages; net{' '}
            <strong>
              {net >= 0 ? '+' : ''}
              {net}m
            </strong>
          </p>
          {!!data.is_alderman_acting && warrant && (
            <details className="StewardDesk__warrant">
              <summary>
                Alderman's Writ: {warrant.trade_remaining}m of{' '}
                {warrant.trade_cap}m remaining today
              </summary>
              <p>
                Trades beyond the warrant are refused. Crown's Purse still pays
                the coin.
              </p>
            </details>
          )}
        </header>
        <TabBar tab={tab} onSwitch={setTab} />
        <main
          ref={bodyRef}
          className="StewardDesk__body"
          tabIndex={0}
          aria-label="Stewardship records"
        >
          <SequestrationBanner sequestration={data.sequestration} />
          <ArrearsBanner sequestration={data.sequestration} />
          <ATCLoanBanner atc_loan={data.atc_loan} />
          <BlockadeBanner regions={data.blockaded_regions} />
          <BanditryBanner projection={data.banditry_projection} />
          <EventsBanner
            events={data.active_events}
            goodCatalog={data.good_catalog}
          />
          {tab === 'orders' && <OrdersView data={data} />}
          {tab === 'market' && (
            <SequesteredOverlay
              active={!!data.sequestration?.active}
              label="Market & Stockpile"
            >
              <MarketView data={data} onTrade={setTradeRequest} />
            </SequesteredOverlay>
          )}
          {tab === 'regions' && (
            <SequesteredOverlay
              active={!!data.sequestration?.active}
              label="Inter-Regional Trade"
            >
              <RegionsView data={data} />
            </SequesteredOverlay>
          )}
          {tab === 'auto_import' && (
            <SequesteredOverlay
              active={!!data.sequestration?.active}
              label="Imports"
            >
              <AutoImportView data={data} />
            </SequesteredOverlay>
          )}
          {tab === 'petition' && <PetitionView data={data} />}
          {tab === 'ledger' && <LedgerView data={data} />}
          {tab === 'royal_custom' && <RoyalCustomPanel />}
          {tab === 'advanced' && (
            <SequesteredOverlay
              active={!!data.sequestration?.active}
              label="Advanced"
            >
              <AdvancedView data={data} />
            </SequesteredOverlay>
          )}
        </main>
        <TradeModal
          request={tradeRequest}
          onClose={() => setTradeRequest(null)}
        />
      </Window.Content>
    </Window>
  );
};
