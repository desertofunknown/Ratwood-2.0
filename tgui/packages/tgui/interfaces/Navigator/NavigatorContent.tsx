import { useBackend } from '../../backend';
import { MarketView } from '../Noticeboard/AvisaSections/MarketSection';
import type { MarketData } from '../Noticeboard/types';

export type NavigatorData = {
  motto: string;
  next_airlift_seconds: number;
  handler_fee_percent: number;
  duty_rate: number;
  pay_taxes: boolean;
  levy_rate: number;
  pay_merchant_share: boolean;
  duty_collected_here: number;
  duty_evaded_here: number;
  levy_collected_here: number;
  is_proprietor: boolean;
  is_smuggler: boolean;
  is_readable: boolean;
  facilitator_present: boolean;
  market_data: MarketData;
};

const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export const NavigatorContent = () => {
  const { data, act } = useBackend<NavigatorData>();
  const motto = data.is_readable
    ? data.motto
    : data.motto.replace(/[^\s]/g, '?');

  return (
    <main className="NavigatorDesk">
      <header className="NavigatorDesk__heading">
        <h1>{motto}</h1>
        <div className="NavigatorDesk__tools">
          <button
            type="button"
            title="Refresh market data (5s cooldown)"
            onClick={() => act('refresh_market')}
          >
            Refresh market
          </button>
          <button
            type="button"
            title="Open the economy guidebook"
            onClick={() => act('help')}
          >
            Guidebook
          </button>
        </div>
      </header>

      <div className="NavigatorDesk__departure">
        <span>
          Next balloon in{' '}
          <strong>{formatCountdown(data.next_airlift_seconds)}</strong>
        </span>
        <span>
          Handler&apos;s fee <strong>{data.handler_fee_percent}%</strong>
        </span>
      </div>

      <dl className="NavigatorDesk__terms">
        {data.is_smuggler ? (
          <>
            <div>
              <dt>Facilitator</dt>
              <dd
                className={
                  data.facilitator_present
                    ? 'NavigatorDesk__good'
                    : 'NavigatorDesk__bad'
                }
              >
                {data.facilitator_present
                  ? 'Present - handler waiving fee'
                  : 'Absent - handler skimming 50%'}
              </dd>
            </div>
            <div>
              <dt>Crown duty</dt>
              <dd className="NavigatorDesk__muted">
                None - the balloon flies dark.
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Crown export duty</dt>
              <dd>
                <strong>{Math.round((data.duty_rate || 0) * 100)}%</strong>
                {data.is_proprietor && (
                  <>
                    <span
                      className={
                        data.pay_taxes
                          ? 'NavigatorDesk__good'
                          : 'NavigatorDesk__bad'
                      }
                    >
                      {data.pay_taxes ? 'PAYING' : 'DODGING'}
                    </span>
                    <button type="button" onClick={() => act('toggle_duty')}>
                      {data.pay_taxes ? 'Stop paying' : 'Resume paying'}
                    </button>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Merchant&apos;s levy</dt>
              <dd>
                <strong>{data.levy_rate}%</strong>
                {data.is_proprietor && (
                  <>
                    <span
                      className={
                        data.pay_merchant_share
                          ? 'NavigatorDesk__good'
                          : 'NavigatorDesk__muted'
                      }
                    >
                      {data.pay_merchant_share ? 'COLLECTING' : 'WAIVED'}
                    </span>
                    <button type="button" onClick={() => act('toggle_levy')}>
                      {data.pay_merchant_share ? 'Waive levy' : 'Resume levy'}
                    </button>
                  </>
                )}
              </dd>
            </div>
            {data.is_proprietor && (
              <div>
                <dt>Private tally</dt>
                <dd>
                  <span className="NavigatorDesk__good">
                    Crown paid: {data.duty_collected_here}m
                  </span>
                  <span className="NavigatorDesk__bad">
                    Crown evaded: {data.duty_evaded_here}m
                  </span>
                  <span>Levy paid: {data.levy_collected_here}m</span>
                </dd>
              </div>
            )}
          </>
        )}
      </dl>

      {!data.is_smuggler && (
        <details className="NavigatorDesk__guidance">
          <summary>Saturated valuables?</summary>
          <p>
            If the Valuables warehouse is choked and no ship hungers for them,
            consider the Stewardry&apos;s stockpile for minting, the bathhouse,
            or a shadier facilitator willing to take such things off your hands.
          </p>
        </details>
      )}

      <MarketView
        market={data.market_data}
        headerLabel={
          data.is_smuggler
            ? 'State of the Shadow Market'
            : 'State of the Markets'
        }
        headerNote={
          data.is_smuggler ? 'Shadow pool - off the books' : undefined
        }
      />
    </main>
  );
};
