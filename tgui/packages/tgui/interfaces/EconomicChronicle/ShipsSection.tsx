import { SectionTitle } from './styles';
import type { ShipSnapshot } from './types';

export const ShipsSection = ({ s }: { s: ShipSnapshot }) => (
  <section>
    <SectionTitle>Foreign Ship Activity</SectionTitle>
    <p>
      {s.total_hails} hail{s.total_hails === 1 ? '' : 's'} recorded. Dock time
      is the average in minutes.
    </p>
    {s.realms.length === 0 ? (
      <p>No foreign ship activity recorded.</p>
    ) : (
      <table>
        <thead>
          <tr>
            <th scope="col">Realm</th>
            <th scope="col" className="EconomicChronicle__number">
              Hails
            </th>
            <th scope="col" className="EconomicChronicle__number">
              Average dock
            </th>
            <th scope="col" className="EconomicChronicle__number">
              Favor
            </th>
          </tr>
        </thead>
        <tbody>
          {s.realms.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td className="EconomicChronicle__number">{row.hails}</td>
              <td className="EconomicChronicle__number">
                {row.avg_dock_min === null ? '—' : row.avg_dock_min}
              </td>
              <td className="EconomicChronicle__number">{row.favor_earned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);
