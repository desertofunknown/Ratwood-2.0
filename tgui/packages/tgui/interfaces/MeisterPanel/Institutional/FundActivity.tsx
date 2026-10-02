import { PaginatedLog } from '../PaginatedLog';
import { type FundEntry, type TabProps } from '../types';

export const FundActivity = ({ fund, data }: { fund: FundEntry; data: TabProps['data'] }) => (
  <section className="MeisterPanel__section">
    <div className="MeisterPanel__sectionTitle"><h2>Tally</h2></div>
    <PaginatedLog key={fund.id} entries={data.institutional_logs[fund.id] ?? []} />
  </section>
);
