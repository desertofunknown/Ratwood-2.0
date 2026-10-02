import type { HarborData } from '../types';

export const LedgerTab = ({ harbor }: { harbor?: HarborData }) => {
  if (!harbor)
    return (
      <p className="Goldface__notice">The ledgers are not yet drawn up.</p>
    );
  const ledger = harbor.ledger;
  return (
    <div className="GoldfaceOffice">
      <section className="GoldfaceOffice__section">
        <h2>
          Merchant Fund{' '}
          <span className="GoldfaceOffice__amount">
            {ledger.merchant_fund_balance}m
          </span>
        </h2>
        <h3>Week audit</h3>
        <dl className="GoldfaceOffice__entries">
          <div>
            <dt>Merchant&apos;s levy collected</dt>
            <dd className="GoldfaceOffice__good">+{ledger.levy_collected}m</dd>
          </div>
          <div>
            <dt>Crown duty paid on levy</dt>
            <dd className="GoldfaceOffice__bad">-{ledger.levy_taxed}m</dd>
          </div>
          <div>
            <dt>Company Gnomes margin</dt>
            <dd className="GoldfaceOffice__good">
              +{ledger.gnome_margin_collected}m
            </dd>
          </div>
        </dl>
        <p className="GoldfaceOffice__muted">
          All credits deposit into the Merchant Fund at your Jawbank. The Crown
          taxes the levy at the prevailing export duty rate; the gnome margin is
          captured at the listed Silverface rate.
        </p>
      </section>
      <section className="GoldfaceOffice__section">
        <h2>Recent fund movements</h2>
        {!ledger.fund_log.length ? (
          <p className="GoldfaceOffice__muted">
            No movements recorded yet this week.
          </p>
        ) : (
          <>
            <table className="GoldfaceOffice__table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.fund_log.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.source}</td>
                    <td
                      className={
                        entry.amount >= 0
                          ? 'GoldfaceOffice__good'
                          : 'GoldfaceOffice__bad'
                      }
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {entry.amount}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="GoldfaceOffice__muted">
              Most recent first. Older entries roll off after twelve.
            </p>
          </>
        )}
      </section>
      <details className="GoldfaceOffice__details">
        <summary>
          Silverface margin
          {harbor.favor.gnome_unlocked
            ? ` (+${ledger.silverface_margin_percent}%)`
            : ''}
        </summary>
        {harbor.favor.gnome_unlocked ? (
          <>
            <p>
              By writ of the Ferentian Guild of Gnomes Porters, the public
              stalls now run under their hand. They take their cost in labour
              and remit the margin of{' '}
              <b>+{ledger.silverface_margin_percent}%</b> on every sale unto the
              Merchant Fund. Adjust the rate from the Management tab as you see
              fit.
            </p>
            <p>
              A heavier margin fattens the Fund per sale; a lighter one draws
              more buyers to the stalls.
            </p>
          </>
        ) : (
          <p>
            By standing pact, the Ferentian Guild of Porters and Stevedores hold
            the margin upon a fixed measure of trade each week. Should you push
            enough goods through the Company&apos;s books, your standing shall
            earn the right to call in their Gnomes - who will take their wage in
            labour alone and remit the margin to your Fund.
          </p>
        )}
      </details>
    </div>
  );
};
