import { useEffect, useRef, useState } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import {
  cardStyle,
  FONT_BODY,
  INK,
  INK_FAINT,
  INK_SOFT,
  inkButtonStyle,
  PARCHMENT_SHADOW,
  SEAL_AMBER,
  SEAL_GREEN,
  SERIF,
  sectionHeaderStyle,
} from './common/parchment';
import { PackRow } from './Goldface/PackRow';
import { SearchBar } from './Goldface/SearchBar';
import { TariffHeader } from './Goldface/TariffHeader';
import type { ActFn, VendingPack } from './Goldface/types';
import { starsIfIlliterate } from './Goldface/util';

type HoardEntry = {
  kind: string;
  time: string;
  text: string;
  amount: number;
  who: string;
};

type BrassfaceData = {
  motto: string;
  budget: number;
  locked: BooleanLike;
  can_read: BooleanLike;
  is_proprietor: BooleanLike;
  dodging: BooleanLike;
  tariff_rate_pct: number;
  tariff_paid: number;
  tariff_evaded: number;
  categories: string[];
  current_category: string;
  search: string;
  search_revision: number;
  search_mode: BooleanLike;
  result_cap: number;
  total_matches: number;
  packs: VendingPack[];
  hoard_log: HoardEntry[];
};

const SecretsCard = (props: {
  data: BrassfaceData;
  canRead: boolean;
  act: ActFn;
}) => {
  const { data, canRead, act } = props;
  return (
    <div style={{ ...cardStyle, marginTop: '12px' }}>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: FONT_BODY,
          color: INK_SOFT,
          textAlign: 'center',
          marginBottom: '6px',
        }}
      >
        {starsIfIlliterate('Secrets', canRead)}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '6px',
          marginTop: '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          style={inkButtonStyle()}
          title={
            data.dodging
              ? 'Resume paying the Crown import tariff on sales'
              : 'Stop paying the Crown import tariff on sales - dodged duty is counted as tax evaded'
          }
          onClick={() => act('toggle_tax')}
        >
          {data.dodging ? 'Enable Paying Taxes' : 'Stop Paying Taxes'}
        </button>
      </div>
    </div>
  );
};

const HoardRow = (props: { entry: HoardEntry }) => {
  const { entry } = props;
  const isPayout = entry.kind === 'payout';
  const color = isPayout ? SEAL_GREEN : SEAL_AMBER;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '52px minmax(0, 1fr) 72px',
        columnGap: '8px',
        padding: '3px 4px',
        borderBottom: `1px dashed ${PARCHMENT_SHADOW}`,
        fontFamily: SERIF,
        fontSize: FONT_BODY,
        color: INK,
      }}
    >
      <span style={{ color: INK_FAINT }}>{entry.time}</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isPayout
          ? entry.text
          : `${entry.text}${entry.who ? ` - consigned by ${entry.who}` : ''}`}
      </span>
      <span style={{ textAlign: 'right', color, fontWeight: 'bold' }}>
        {isPayout ? `+${entry.amount}m` : `${entry.amount}m`}
      </span>
    </div>
  );
};

const HoardTab = (props: { entries: HoardEntry[]; canRead: boolean }) => {
  const { entries, canRead } = props;
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ ...sectionHeaderStyle, marginTop: '4px' }}>
        {starsIfIlliterate(`Hoard Ledger (${entries.length})`, canRead)}
      </div>
      {entries.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: INK_SOFT }}>
          {starsIfIlliterate('The hoard keeps no records yet.', canRead)}
        </div>
      ) : (
        entries.map((entry, i) => <HoardRow key={i} entry={entry} />)
      )}
    </div>
  );
};

export const Brassface = () => {
  const { act, data } = useBackend<BrassfaceData>();
  const [tab, setTab] = useState<'shop' | 'hoard'>('shop');
  const initializedCategory = useRef(false);
  const [searchReset, setSearchReset] = useState(0);
  const canRead = !!data.can_read;
  const isProprietor = !!data.is_proprietor;
  const inSearchMode = !!data.search_mode;
  const hasCategory = !!data.current_category;

  useEffect(() => {
    if (initializedCategory.current || !data.categories.length) return;
    initializedCategory.current = true;
    if (!data.current_category && !data.search) {
      setSearchReset((value) => value + 1);
      act('changecat', { category: data.categories[0] });
    }
  }, [act, data.categories, data.current_category, data.search]);

  return (
    <Window width={840} height={760}>
      <Window.Content className="KeepLedger TradeCounter" scrollable>
        <header className="TradeCounter__header">
          <TariffHeader
            motto={data.motto}
            canRead={canRead}
            tariffRatePct={data.tariff_rate_pct}
            tariffPaid={data.tariff_paid}
            tariffEvaded={data.tariff_evaded}
            isProprietor={isProprietor}
            dodging={!!data.dodging}
          />
          <div className="TradeCounter__balance">
            <div><span>{starsIfIlliterate('Mammon loaded', canRead)}</span><strong>{data.budget}<small>m</small></strong></div>
            <button type="button" disabled={data.budget <= 0 || !!data.locked} onClick={() => act('change')}>Return coins</button>
          </div>
        </header>
        <nav className="TradeCounter__tabs" aria-label="Brassface sections">
          <button type="button" aria-pressed={tab === 'shop'} onClick={() => setTab('shop')}>Shop</button>
          <button type="button" aria-pressed={tab === 'hoard'} onClick={() => setTab('hoard')}>Hoard ledger</button>
        </nav>
        {!!data.locked && <p className="TradeCounter__notice">This counter is locked. You can browse its stock.</p>}
        {tab === 'shop' ? (
          <div className="TradeCounter__body">
            <nav className="TradeCounter__categories" aria-label="Goods categories">
              {data.categories.map((category) => (
                <button key={category} type="button" aria-pressed={!inSearchMode && category === data.current_category} onClick={() => {
                  setSearchReset((value) => value + 1);
                  act('changecat', { category });
                }}>
                  {category}
                </button>
              ))}
            </nav>
            <main className="TradeCounter__goods">
              <div className="TradeCounter__toolbar">
                <div className="TradeCounter__listHeading">
                  <h2>{inSearchMode ? 'Search results' : data.current_category || 'Goods'}</h2>
                  <span>({data.packs.length})</span>
                </div>
                <SearchBar serverSearch={data.search} searchRevision={data.search_revision} resetKey={searchReset} act={act} />
              </div>
              {!hasCategory && !inSearchMode ? (
                <p className="TradeCounter__notice">Choose a category to browse its goods.</p>
              ) : !data.packs.length ? (
                <p className="TradeCounter__notice">{inSearchMode ? `No goods match "${data.search}".` : 'This category has no stock.'}</p>
              ) : (
                <div className="TradeCounter__stock">
                  {data.packs.map((pack) => (
                    <div className="TradeCounter__item" key={pack.ref}>
                      <PackRow pack={pack} budget={data.budget} canRead={canRead} showCategory={inSearchMode} browseOnly={!!data.locked} act={act} />
                    </div>
                  ))}
                </div>
              )}
              {inSearchMode && data.total_matches > data.result_cap && (
                <p className="TradeCounter__notice">Showing {data.result_cap} of {data.total_matches} matches. Refine your search to narrow the list.</p>
              )}
              {isProprietor && <SecretsCard data={data} canRead={canRead} act={act} />}
            </main>
          </div>
        ) : (
          <div className="TradeCounter__ledger"><HoardTab entries={data.hoard_log || []} canRead={canRead} /></div>
        )}
      </Window.Content>
    </Window>
  );
};
