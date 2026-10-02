import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import { groupByCategory } from './helpers';
import type { AutoImportRow, Data } from './types';

export const AutoImportView = (props: { data: Data }) => {
  const { act } = useBackend<Data>();
  const { auto_import, good_catalog } = props.data;
  const {
    today_spent,
    purse_floor,
    floor_target,
    batch_size,
    max_price_mult,
    essentials,
    others,
    history,
  } = auto_import;
  const aldermanActing = !!props.data.is_alderman_acting;
  const aldermanBlockTitle =
    "Reserved to the Steward's office - the Alderman has no say in the Crown's stockpile.";
  const [floorDraft, setFloorDraft] = useState<string>(String(purse_floor));
  const previousFloor = useRef(purse_floor);
  useEffect(() => {
    const previous = previousFloor.current;
    previousFloor.current = purse_floor;
    setFloorDraft((value) =>
      value.trim() !== '' && Number(value) === previous
        ? String(purse_floor)
        : value,
    );
  }, [purse_floor]);
  const floorAmount = Number(floorDraft);
  const validFloor =
    floorDraft.trim() !== '' &&
    Number.isInteger(floorAmount) &&
    floorAmount >= 0 &&
    floorAmount <= 99999;
  const canSetFloor =
    !aldermanActing && validFloor && floorAmount !== purse_floor;
  const activeCount =
    essentials.filter((row) => row.active).length +
    others.filter((row) => row.active).length;
  const groupedOthers = groupByCategory(others, good_catalog);
  const [activeCategory, setActiveCategory] = useState(
    groupedOthers[0]?.category ?? '',
  );
  const activeGroup =
    groupedOthers.find((group) => group.category === activeCategory) ??
    groupedOthers[0];

  const importTable = (rows: AutoImportRow[], label: string) => (
    <table className="StewardRoutes__imports" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">Standing import</th>
          <th scope="col" className="StewardRoutes__number">
            Stock / target
          </th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ToggleRow
            key={row.good_id}
            row={row}
            name={good_catalog[row.good_id]?.name ?? row.good_id}
            floorTarget={floor_target}
            disabled={aldermanActing}
            disabledTitle={aldermanBlockTitle}
            onToggle={() => {
              if (!aldermanActing)
                act('toggle_auto_import', { good_id: row.good_id });
            }}
          />
        ))}
      </tbody>
    </table>
  );

  return (
    <section className="StewardRoutes" aria-label="Standing Imports">
      <div className="StewardRoutes__heading">
        <h2>Standing Imports</h2>
        <span>
          Today&apos;s spend: <strong>{today_spent}m</strong> · Goods on
          standing import: <strong>{activeCount}</strong>
        </span>
      </div>
      <p>
        Tops up each good by {batch_size} units every 6 minutes when stock is
        below {floor_target}, skipping when a unit would cost more than{' '}
        {max_price_mult}x its base price.
      </p>
      <div className="StewardRoutes__floor">
        <label>
          Purse floor:
          <input
            type="number"
            value={floorDraft}
            min={0}
            max={99999}
            step={1}
            aria-label="Standing import purse floor"
            aria-invalid={!validFloor}
            disabled={aldermanActing}
            title={aldermanActing ? aldermanBlockTitle : undefined}
            onChange={(event) => setFloorDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!canSetFloor}
          title={aldermanActing ? aldermanBlockTitle : undefined}
          onClick={() => {
            if (canSetFloor)
              act('set_auto_import_purse_floor', { amount: floorAmount });
          }}
        >
          Set
        </button>
        <button
          type="button"
          className="StewardRoutes__danger"
          disabled={aldermanActing}
          title={
            aldermanActing
              ? aldermanBlockTitle
              : 'Strike every standing import from the ledger at once.'
          }
          onClick={() => {
            if (!aldermanActing) act('kill_switch_auto_import');
          }}
        >
          Strike All
        </button>
      </div>
      {aldermanActing && (
        <p className="StewardRoutes__muted">{aldermanBlockTitle}</p>
      )}
      <h3>Essentials (on by default)</h3>
      {essentials.length ? (
        importTable(essentials, 'Essential standing imports')
      ) : (
        <p className="StewardRoutes__muted">No essentials configured.</p>
      )}
      <h3>Other Goods</h3>
      {!groupedOthers.length ? (
        <p className="StewardRoutes__muted">
          No other goods may be placed on standing import at present.
        </p>
      ) : (
        <>
          <nav
            className="StewardRoutes__categories"
            aria-label="Standing import categories"
          >
            {groupedOthers.map((group) => (
              <button
                key={group.category}
                type="button"
                aria-pressed={group.category === activeGroup?.category}
                onClick={() => setActiveCategory(group.category)}
              >
                {group.label} ({group.rows.filter((row) => row.active).length}/
                {group.rows.length})
              </button>
            ))}
          </nav>
          {activeGroup &&
            importTable(
              activeGroup.rows,
              `${activeGroup.label} standing imports`,
            )}
        </>
      )}
      <h3>
        Tally (last {history.length} day{history.length === 1 ? '' : 's'})
      </h3>
      {!history.length ? (
        <p className="StewardRoutes__muted">
          No auto-import history yet. First tick will record here.
        </p>
      ) : (
        <table
          className="StewardRoutes__history"
          aria-label="Standing import history"
        >
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className="StewardRoutes__number">
                Spent
              </th>
              <th scope="col">Activity</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((entry, index) => (
              <tr key={`${entry.day}-${index}`}>
                <th scope="row">Day {entry.day}</th>
                <td className="StewardRoutes__number">{entry.spent}m</td>
                <td>
                  {entry.lines.length ? (
                    entry.lines.map((line, lineIndex) => (
                      <div key={lineIndex}>{line}</div>
                    ))
                  ) : (
                    <span className="StewardRoutes__muted">
                      No auto-import activity.
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

const ToggleRow = (props: {
  row: AutoImportRow;
  name: string;
  floorTarget: number;
  disabled: boolean;
  disabledTitle: string;
  onToggle: () => void;
}) => {
  const { row, name, floorTarget, disabled, disabledTitle, onToggle } = props;
  const low = row.stock < floorTarget;
  return (
    <tr title={disabled ? disabledTitle : undefined}>
      <th scope="row">
        <label>
          <input
            type="checkbox"
            aria-label={`Standing import: ${name}`}
            checked={!!row.active}
            disabled={disabled}
            onChange={onToggle}
          />
          <span>{name}</span>
        </label>
      </th>
      <td
        className={`StewardRoutes__number${low ? ' StewardRoutes__danger' : ''}`}
      >
        {row.stock} / {floorTarget}
      </td>
      <td className="StewardRoutes__status">
        {!row.active ? 'Off' : low ? 'Will top up' : 'Stocked'}
      </td>
    </tr>
  );
};
