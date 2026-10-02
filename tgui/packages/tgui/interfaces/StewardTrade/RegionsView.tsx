import { useState } from 'react';

import { useBackend } from '../../backend';
import { groupByCategory } from './helpers';
import type { Data, RegionFlow, RegionRow } from './types';

export const RegionsView = (props: { data: Data }) => {
  const { region_rows, region_catalog } = props.data;
  const sorted = [...region_rows].sort((a, b) => {
    if (!!a.blockaded !== !!b.blockaded) return a.blockaded ? -1 : 1;
    const an = region_catalog[a.region_id]?.name ?? a.region_id;
    const bn = region_catalog[b.region_id]?.name ?? b.region_id;
    return an.localeCompare(bn);
  });

  return (
    <section className="StewardRoutes" aria-label="Regions">
      <h2>Regions</h2>
      {sorted.length === 0 && <p>No regional trade routes are available.</p>}
      {sorted.map((region) => (
        <RegionEntry key={region.region_id} region={region} data={props.data} />
      ))}
    </section>
  );
};

const RegionEntry = (props: { region: RegionRow; data: Data }) => {
  const { act } = useBackend<Data>();
  const { region, data } = props;
  const meta = data.region_catalog[region.region_id];
  const regionName = meta?.name ?? region.region_id;
  const [expanded, setExpanded] = useState(!!region.blockaded);
  const importable = region.produces.some(
    (flow) => data.good_catalog[flow.good_id]?.importable,
  );
  const importDisabled = !importable;

  return (
    <section className="StewardRoutes__region">
      <button
        type="button"
        className="StewardRoutes__disclosure"
        aria-expanded={expanded}
        aria-label={regionName}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        <strong>{regionName}</strong>
        {!!region.blockaded && (
          <span className="StewardRoutes__danger">Blockaded</span>
        )}
        <span className="StewardRoutes__counts">
          {region.produces.length} produces · {region.demands.length} demands
        </span>
      </button>
      {expanded && (
        <div className="StewardRoutes__details">
          {meta?.description && <p>{meta.description}</p>}
          <div className="StewardRoutes__flows">
            <FlowColumn
              title="Produces"
              flows={region.produces}
              data={data}
              regionName={regionName}
            />
            <FlowColumn
              title="Demands"
              flows={region.demands}
              data={data}
              regionName={regionName}
            />
          </div>
          <div className="StewardRoutes__actions">
            {region.produces.length > 0 && (
              <button
                type="button"
                disabled={importDisabled}
                title={
                  !importable
                    ? 'This region has no importable goods.'
                    : undefined
                }
                onClick={() => {
                  if (!importDisabled)
                    act('trade_region_import', { region_id: region.region_id });
                }}
              >
                Import from {regionName}
              </button>
            )}
            {region.demands.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  act('trade_region_export', { region_id: region.region_id });
                }}
              >
                Export to {regionName}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

const FlowColumn = (props: {
  title: string;
  flows: RegionFlow[];
  data: Data;
  regionName: string;
}) => {
  const { title, flows, data, regionName } = props;
  const groups = groupByCategory(flows, data.good_catalog);
  return (
    <div>
      <h3>
        {title} ({flows.length})
      </h3>
      {!flows.length ? (
        <p className="StewardRoutes__muted">None</p>
      ) : (
        <table aria-label={`${regionName} ${title.toLowerCase()}`}>
          <thead>
            <tr>
              <th scope="col">Good</th>
              <th scope="col" className="StewardRoutes__number">
                Per day
              </th>
              <th scope="col" className="StewardRoutes__number">
                Remaining
              </th>
            </tr>
          </thead>
          {groups.map(({ category, label, rows }) => (
            <tbody key={category}>
              <tr className="StewardRoutes__category">
                <th colSpan={3} scope="rowgroup">
                  {label}
                </th>
              </tr>
              {rows.map((flow) => (
                <tr key={flow.good_id}>
                  <th scope="row">
                    {data.good_catalog[flow.good_id]?.name ?? flow.good_id}
                  </th>
                  <td className="StewardRoutes__number">{flow.total}</td>
                  <td className="StewardRoutes__number">{flow.today}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
};
