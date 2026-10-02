import { useState } from 'react';

import { type PatronRoster, type PatronRosterStatic, type TabProps } from './types';

export const PatronageTab = ({ data, act }: TabProps) => {
  const fundsWithPatronage = data.funds.filter(
    (f) => f.has_patronage && data.patron_rosters[f.id]?.can_manage,
  );
  const [selectedFundId, setSelectedFundId] = useState<string>(
    fundsWithPatronage[0]?.id ?? '',
  );
  const selectedFund = fundsWithPatronage.find((f) => f.id === selectedFundId) ?? fundsWithPatronage[0];

  if (!selectedFund) {
    return <p className="MeisterPanel__empty">You hold no patronage authority.</p>;
  }
  const roster = data.patron_rosters[selectedFund.id];
  const rosterStatic = data.patron_rosters_static[selectedFund.id];

  return (
    <>
      {fundsWithPatronage.length > 1 && (
        <nav className="MeisterPanel__funds" aria-label="Patronage funds">
          {fundsWithPatronage.map((f) => (
            <button
              type="button"
              key={f.id}
              aria-pressed={selectedFund.id === f.id}
              onClick={() => setSelectedFundId(f.id)}
            >
              {f.patron_label}
            </button>
          ))}
        </nav>
      )}
      {!!roster && !!rosterStatic && (
        <RosterView key={selectedFund.id} fundId={selectedFund.id} roster={roster} rosterStatic={rosterStatic} act={act} />
      )}
    </>
  );
};

const RosterView = ({ fundId, roster, rosterStatic, act }: {
  fundId: string;
  roster: PatronRoster;
  rosterStatic: PatronRosterStatic;
  act: TabProps['act'];
}) => {
  const enrolled = roster.patrons.length;
  const full = enrolled >= roster.cap;
  const sigSplit = rosterStatic.explanation.lastIndexOf(' - ');
  const body = sigSplit >= 0 ? rosterStatic.explanation.slice(0, sigSplit).trimEnd() : rosterStatic.explanation;
  const signature = sigSplit >= 0 ? rosterStatic.explanation.slice(sigSplit + 3).trim() : '';

  return (
    <section className="MeisterPanel__section">
      <div className="MeisterPanel__sectionTitle">
        <h2>{roster.label}</h2>
        <span>{enrolled} / {roster.cap} enrolled</span>
      </div>
      {!!rosterStatic.explanation && (
        <details className="MeisterPanel__disclosure">
          <summary>Terms of patronage</summary>
          <div className="MeisterPanel__lore">
            {body}
            {!!signature && <p className="MeisterPanel__signature">- {signature}</p>}
          </div>
        </details>
      )}
      {full && <p className="MeisterPanel__help">Roster full. Revoke a patron before drafting a new writ.</p>}
      {!enrolled && <p className="MeisterPanel__empty">No patrons enrolled.</p>}
      {roster.patrons.map((p) => (
        <div key={p.ref} className="MeisterPanel__rosterRow">
          <span>{p.name}{p.job ? `, the ${p.job}` : ''}</span>
          <button
            type="button"
            aria-label={`Revoke patronage for ${p.name}`}
            onClick={() => act('revoke_patronage', { fund_id: fundId, target_ref: p.ref })}
          >
            Revoke
          </button>
        </div>
      ))}
      <div className="MeisterPanel__actions MeisterPanel__actions--end">
        <button type="button" disabled={full} onClick={() => act('issue_patronage', { fund_id: fundId })}>
          Draft writ
        </button>
      </div>
    </section>
  );
};
