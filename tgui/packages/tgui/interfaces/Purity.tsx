import { useState } from 'react';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../backend';
import { Window } from '../layouts';
import {
  cardStyle,
  FONT_BODY,
  INK_FAINT,
  INK_SOFT,
  inkButtonStyle,
  SEAL_AMBER,
  SEAL_GREEN,
  SEAL_RED,
  SERIF,
} from './common/parchment';
import { PackRow } from './Goldface/PackRow';
import type { ActFn, VendingPack } from './Goldface/types';
import { starsIfIlliterate } from './Goldface/util';

type PurityData = {
  motto: string;
  budget: number;
  locked: BooleanLike;
  can_read: BooleanLike;
  is_proprietor: BooleanLike;
  dodging: BooleanLike;
  tariff_rate_pct: number;
  tariff_paid: number;
  tariff_evaded: number;
  recent_payments: number;
  secret_budget: number;
  cut_pct: number;
  upgrade_a_unlocked: BooleanLike;
  upgrade_b_unlocked: BooleanLike;
  upgrade_a_cost: number;
  upgrade_b_cost: number;
  withdraw_tax: number;
  withdraw_net: number;
  items: VendingPack[];
};

const SecretsCard = (props: {
  data: PurityData;
  canRead: boolean;
  act: ActFn;
}) => {
  const { data, canRead, act } = props;
  const noCut = data.secret_budget < 1;
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
          textAlign: 'center',
          fontFamily: SERIF,
          fontSize: FONT_BODY,
        }}
      >
        <span style={{ color: INK_SOFT }}>
          {starsIfIlliterate('Mammon Washing:', canRead)} {data.recent_payments}
        </span>
        <span style={{ color: INK_FAINT, margin: '0 6px' }}>·</span>
        <span style={{ color: SEAL_AMBER }}>
          {starsIfIlliterate('Your cut, Master!', canRead)} {data.secret_budget}
          m ({data.cut_pct}%)
        </span>
      </div>
      <div
        style={{
          textAlign: 'center',
          fontFamily: SERIF,
          fontSize: FONT_BODY,
          marginTop: '2px',
        }}
      >
        <span style={{ color: SEAL_GREEN }}>Paid: {data.tariff_paid}m</span>
        <span style={{ color: INK_FAINT, margin: '0 6px' }}>·</span>
        <span style={{ color: SEAL_RED }}>Evaded: {data.tariff_evaded}m</span>
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
          style={inkButtonStyle({ disabled: noCut })}
          disabled={noCut}
          title={`Deposit ${data.withdraw_net}m into your account - the Crown keeps ${data.withdraw_tax}m in duty`}
          onClick={() => act('withdraw_cut', { mode: 'bank' })}
        >
          To Bank ({data.withdraw_net}m after duty)
        </button>
        <button
          type="button"
          style={inkButtonStyle({ disabled: noCut })}
          disabled={noCut}
          title={`Withdraw the full ${data.secret_budget}m as coin - no duty paid, counted as tax evaded`}
          onClick={() => act('withdraw_cut', { mode: 'direct' })}
        >
          Direct (Untaxed)
        </button>
        <button
          type="button"
          style={inkButtonStyle()}
          onClick={() => act('toggle_tax')}
        >
          {data.dodging ? 'Enable Paying Taxes' : 'Stop Paying Taxes'}
        </button>
        {!data.upgrade_a_unlocked && (
          <button
            type="button"
            style={inkButtonStyle()}
            title="Raise your laundering cut from 10% to 25%"
            onClick={() => act('unlock_cut', { level: 'a' })}
          >
            Unlock 25% Cut ({data.upgrade_a_cost})
          </button>
        )}
        {!!data.upgrade_a_unlocked && !data.upgrade_b_unlocked && (
          <button
            type="button"
            style={inkButtonStyle()}
            title="Raise your laundering cut from 25% to 50%"
            onClick={() => act('unlock_cut', { level: 'b' })}
          >
            Unlock 50% Cut ({data.upgrade_b_cost})
          </button>
        )}
      </div>
    </div>
  );
};

export const Purity = () => {
  const { act, data } = useBackend<PurityData>();
  const canRead = !!data.can_read;
  const isProprietor = !!data.is_proprietor;
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? data.items.filter((pack) => pack.name.toLowerCase().includes(needle))
    : data.items;

  return (
    <Window width={620} height={720}>
      <Window.Content className="KeepLedger TradeCounter" scrollable>
        <header className="TradeCounter__header">
          <div className="TradeTariff">
            <h1>{starsIfIlliterate(data.motto, canRead)}</h1>
            <p className="TradeTariff__rates">Crown duty: <b>{data.tariff_rate_pct}%</b>. Prices include duty.</p>
            {isProprietor && !!data.dodging && <p style={{ color: SEAL_RED }}>Crown duty is being withheld.</p>}
          </div>
          <div className="TradeCounter__balance">
            <div><span>{starsIfIlliterate('Mammon loaded', canRead)}</span><strong>{data.budget}<small>m</small></strong></div>
            <button type="button" disabled={data.budget <= 0 || !!data.locked} onClick={() => act('change')}>Return coins</button>
          </div>
        </header>
        {!!data.locked && <p className="TradeCounter__notice">This counter is locked. You can browse its stock.</p>}
        <main className="TradeCounter__goods">
          <div className="TradeCounter__search">
            <label htmlFor="purity-search">Goods ({shown.length}/{data.items.length})</label>
            <input id="purity-search" type="text" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search the stock..." />
            {!!search && <button type="button" onClick={() => setSearch('')}>Clear</button>}
          </div>
          {!shown.length ? (
            <p className="TradeCounter__notice">{needle ? `No goods match "${search}".` : 'This counter has no stock.'}</p>
          ) : (
            <div className="TradeCounter__stock">
              {shown.map((pack) => (
                <div key={pack.ref} className="TradeCounter__item">
                  <PackRow pack={pack} budget={data.budget} canRead={canRead} showCategory={false} browseOnly={!!data.locked} act={act} />
                </div>
              ))}
            </div>
          )}
          {isProprietor && <SecretsCard data={data} canRead={canRead} act={act} />}
        </main>
      </Window.Content>
    </Window>
  );
};
