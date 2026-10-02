import { useState } from 'react';

import { useBackend } from '../../backend';
import { MailLog } from './MailLog';
import { SlotRow } from './SlotRow';
import { formatCountdown } from './types';
import type { ZadcoteData } from './types';

export const ZadcoteContent = () => {
  const { data, act } = useBackend<ZadcoteData>();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'slots' | 'log'>('slots');
  const lowReserve =
    data.reserve <= Math.max(2, Math.floor(data.reserve_start * 0.2));
  const canWithdraw = data.can_operate && data.voyeur_fund > 0;
  return (
    <main className="Zadcote">
      <header className="Zadcote__heading">
        <div>
          <h1>{data.motto || 'Zadcote'}</h1>
          <p>A flock of trained zads at your call.</p>
        </div>
        <button
          type="button"
          title="Open the zadcote handbook"
          disabled={!data.can_operate}
          onClick={() => {
            if (data.can_operate) act('help');
          }}
        >
          Handbook
        </button>
      </header>
      <dl className="Zadcote__reserves">
        <div>
          <dt>Reserve</dt>
          <dd className={lowReserve ? 'Zadcote__bad' : undefined}>
            <strong>{data.reserve}</strong> / {data.reserve_start}
          </dd>
        </div>
        <div>
          <dt>Flights</dt>
          <dd>
            <strong>{data.flights}</strong> / {data.flight_cap}
          </dd>
        </div>
        <div>
          <dt>Bombs</dt>
          <dd>
            <strong>{data.bomb_stock}</strong> / {data.bomb_stock_cap}
          </dd>
        </div>
        {data.bomb_cooldown_remaining > 0 && (
          <div>
            <dt>Bombs ready in</dt>
            <dd className="Zadcote__accent">
              {formatCountdown(data.bomb_cooldown_remaining)}
            </dd>
          </div>
        )}
        {!!data.allows_voyeur && (
          <div className="Zadcote__fund">
            <dt>Scrying fund</dt>
            <dd>
              <span
                className={
                  data.voyeur_fund < data.voyeur_cost
                    ? 'Zadcote__bad'
                    : undefined
                }
              >
                <strong>{data.voyeur_fund}m</strong> ({data.voyeur_cost}m /
                scry)
              </span>
              <button
                type="button"
                disabled={!canWithdraw}
                title={
                  data.voyeur_fund <= 0
                    ? 'The scrying basin is empty.'
                    : `Drain ${data.voyeur_fund}m from the scrying basin into coin.`
                }
                onClick={() => {
                  if (canWithdraw) act('withdraw_voyeur');
                }}
              >
                Withdraw
              </button>
            </dd>
          </div>
        )}
      </dl>
      {!data.can_operate && (
        <p className="Zadcote__bad">
          Only the zadcote&apos;s faction may operate it.
        </p>
      )}
      <nav className="Zadcote__tabs" aria-label="Zadcote">
        <button
          type="button"
          aria-pressed={tab === 'slots'}
          onClick={() => setTab('slots')}
        >
          Zadlinks
        </button>
        <button
          type="button"
          aria-pressed={tab === 'log'}
          onClick={() => setTab('log')}
        >
          Mail Ledger
          {data.mail_log.length > 0 ? ` (${data.mail_log.length})` : ''}
        </button>
      </nav>
      <section hidden={tab !== 'slots'} aria-label="Zadlinks">
        {data.slots.length === 0 ? (
          <p className="Zadcote__muted">
            No zadlinks. Strike a zadcage on the cote to bond one.
          </p>
        ) : (
          data.slots.map((slot) => (
            <SlotRow
              key={slot.slot}
              data={data}
              slot={slot}
              expanded={expandedSlot === slot.slot}
              onToggle={() =>
                setExpandedSlot((previous) =>
                  previous === slot.slot ? null : slot.slot,
                )
              }
              act={act}
            />
          ))
        )}
      </section>
      <section hidden={tab !== 'log'} aria-label="Mail Ledger">
        <MailLog entries={data.mail_log} />
      </section>
    </main>
  );
};
