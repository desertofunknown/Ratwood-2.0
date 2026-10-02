import { useState } from 'react';

import { useBackend } from '../../backend';

type CategoryRate = {
  category: string;
  label?: string;
  rate: number;
};

type PollProjection = {
  income: number;
  subsidy: number;
  net: number;
  headcount: number;
};

type Data = {
  categoryRates: CategoryRate[];
  pollTaxRates: CategoryRate[];
  pollTaxMax: number;
  pollTaxMin: number;
  levySubmissionMin?: number;
  levyCooldown: boolean;
  pollCooldown: boolean;
  pollProjection?: PollProjection;
};

const emptyRates: CategoryRate[] = [];
const wholeRate = (value: string, min: number, max: number) =>
  value.trim() !== '' &&
  Number.isInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max;

const useRateDrafts = (rows: CategoryRate[], locked: boolean) => {
  const [state, setState] = useState(() => ({
    rows,
    locked,
    drafts: Object.fromEntries(
      rows.map((row) => [row.category, String(row.rate)]),
    ),
  }));
  let drafts = state.drafts;
  if (state.rows !== rows || state.locked !== locked) {
    const previous = new Map(state.rows.map((row) => [row.category, row.rate]));
    drafts = Object.fromEntries(
      rows.map((row) => {
        const value = state.drafts[row.category];
        // A locked roll shows enacted rates, including partial Concordat rejections.
        const untouched =
          value?.trim() !== '' && Number(value) === previous.get(row.category);
        return [
          row.category,
          locked ||
          value === undefined ||
          untouched ||
          (Number(value) === row.rate && value.trim() !== '')
            ? String(row.rate)
            : value,
        ];
      }),
    );
    setState({ rows, locked, drafts });
  }
  return {
    drafts,
    change: (category: string, value: string) => {
      if (!locked)
        setState((current) => ({
          ...current,
          drafts: { ...current.drafts, [category]: value },
        }));
    },
  };
};

const RateColumn = (props: {
  title: string;
  rows: CategoryRate[];
  locked: boolean;
  min: number;
  max: number;
  unit: string;
  actionLabel: string;
  onSubmit: (rates: { category: string; rate: number }[]) => void;
  children?: React.ReactNode;
}) => {
  const {
    title,
    rows,
    locked,
    min,
    max,
    unit,
    actionLabel,
    onSubmit,
    children,
  } = props;
  const { drafts, change } = useRateDrafts(rows, locked);
  // Existing rates below the Concordat floor may remain; new reductions may not.
  const inputMin = (row: CategoryRate) =>
    Number(drafts[row.category]) === row.rate ? Math.min(min, row.rate) : min;
  const valid = rows.every((row) =>
    wholeRate(drafts[row.category], inputMin(row), max),
  );
  const changed = rows.some((row) => Number(drafts[row.category]) !== row.rate);
  const canSubmit = !locked && valid && changed;
  return (
    <section className="TaxRoll__column" aria-label={title}>
      <h2>{title}</h2>
      {children}
      <p
        className={locked ? 'TaxRoll__locked' : 'TaxRoll__muted'}
        role="status"
      >
        {locked
          ? 'Adjusted today — locked until tomorrow.'
          : 'May be changed once per day.'}
      </p>
      <div className="TaxRoll__rates">
        {rows.map((row) => {
          const label = row.label || row.category;
          const rowValid = wholeRate(drafts[row.category], inputMin(row), max);
          return (
            <label className="TaxRoll__rate" key={row.category}>
              <span>{label}</span>
              <span className="TaxRoll__amount">
                <input
                  type="number"
                  aria-label={`${title}: ${label}`}
                  aria-invalid={!rowValid}
                  min={inputMin(row)}
                  max={max}
                  step={1}
                  value={drafts[row.category]}
                  disabled={locked}
                  onChange={(event) => change(row.category, event.target.value)}
                />
                <span>{unit}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!valid && (
        <p className="TaxRoll__error" role="alert">
          Enter whole values from {min} to {max}.
        </p>
      )}
      <div className="TaxRoll__actions">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            if (canSubmit)
              onSubmit(
                rows.map((row) => ({
                  category: row.category,
                  rate: Number(drafts[row.category]),
                })),
              );
          }}
        >
          {actionLabel}
        </button>
        {canSubmit && <span className="TaxRoll__muted">Unsaved changes</span>}
      </div>
    </section>
  );
};

export const TaxRollContent = () => {
  const { act, data } = useBackend<Data>();
  const projection = data.pollProjection;
  return (
    <div className="TaxRoll">
      <RateColumn
        title="Crown Levies"
        rows={data.categoryRates || emptyRates}
        locked={!!data.levyCooldown}
        min={data.levySubmissionMin ?? 0}
        max={100}
        unit="%"
        actionLabel="Make It So"
        onSubmit={(categoryRates) => act('set_rates', { categoryRates })}
      >
        {!!data.levySubmissionMin && (
          <p>
            The Concordat forbids new levies below {data.levySubmissionMin}%.
          </p>
        )}
      </RateColumn>
      <RateColumn
        title="Poll Tax"
        rows={data.pollTaxRates || emptyRates}
        locked={!!data.pollCooldown}
        min={data.pollTaxMin ?? 0}
        max={data.pollTaxMax ?? 50}
        unit="m"
        actionLabel="Set Poll Taxes"
        onSubmit={(pollTaxRates) => act('set_poll_rates', { pollTaxRates })}
      >
        <p>
          Per category, per tick. Negative values pay the subject from the
          Crown&apos;s Purse each tick (subsidy); positive values collect.
          Subsidies reach charter-protected classes; taxes do not.
        </p>
        {projection && (
          <div className="TaxRoll__projection">
            <div className="TaxRoll__projectionHeading">
              <strong>Current enacted rates · per tick</strong>
              <strong
                className={
                  projection.net < 0
                    ? 'TaxRoll__bad'
                    : projection.net > 0
                      ? 'TaxRoll__good'
                      : undefined
                }
              >
                {projection.net > 0 ? '+' : ''}
                {projection.net}m
              </strong>
            </div>
            <div className="TaxRoll__totals">
              <span>Income: {projection.income}m</span>
              <span>Subsidy: −{projection.subsidy}m</span>
              <span>
                {projection.headcount} head
                {projection.headcount === 1 ? '' : 's'}
              </span>
            </div>
            <p className="TaxRoll__muted">
              Gross projection from rate × eligible heads. Ignores balance,
              advance, arrears. Unsaved changes are not included.
            </p>
          </div>
        )}
      </RateColumn>
    </div>
  );
};
