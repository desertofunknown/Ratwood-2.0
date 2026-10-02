import { SectionTitle } from './styles';
import type { BucketSnapshot } from './types';

export const BucketsSection = ({ b }: { b: BucketSnapshot }) => (
  <section>
    <SectionTitle>Navigator Buckets</SectionTitle>
    <div className="EconomicChronicle__columns">
      <section>
        <h3>Real Market</h3>
        {b.real.length === 0 ? (
          <p>No real-market activity recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Bucket</th>
                <th scope="col" className="EconomicChronicle__number">
                  Sold
                </th>
                <th scope="col" className="EconomicChronicle__number">
                  Relieved
                </th>
              </tr>
            </thead>
            <tbody>
              {b.real.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td className="EconomicChronicle__number">{row.sold}</td>
                  <td className="EconomicChronicle__number">{row.relieved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h3>Black Market</h3>
        {b.black_market.length === 0 ? (
          <p>No black-market activity recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Bucket</th>
                <th scope="col" className="EconomicChronicle__number">
                  Sold
                </th>
              </tr>
            </thead>
            <tbody>
              {b.black_market.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td className="EconomicChronicle__number">{row.sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  </section>
);
