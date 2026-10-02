import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import type { AssemblyData, BracketTally, Warrant, YaeNayTally } from './types';

const formatWeight = (doubled: number) => `${Math.max(0, doubled) / 2}`;
const formatCountdown = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${(seconds % 60).toString().padStart(2, '0')}s`;

export const AssemblyContent = () => {
  const { act, data } = useBackend<AssemblyData>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const canVote = !data.is_outlaw && data.my_weight_doubled > 0;
  const countdown = Math.max(0, data.next_resolution_seconds);

  return (
    <main className="CityAssembly">
      <header className="CityAssembly__heading">
        <h1>The City Assembly</h1>
        <button
          type="button"
          onClick={() => act('back_to_noticeboard')}
          title="Return to the Noticeboard."
        >
          &#9668; Back to the Noticeboard
        </button>
        <p>Voice of the respectable citizenry of Rotwood Vale</p>
      </header>
      <div className="CityAssembly__session">
        <span>
          Session #{data.session_number}
          {countdown > 0
            ? ` • resolves in ${formatCountdown(countdown)}`
            : ` • resolves at ${data.next_resolution}`}
        </span>
        <span>
          {data.voter_count} voter{data.voter_count === 1 ? '' : 's'} &middot;
          your weight {formatWeight(data.my_weight_doubled)}
          {data.is_censured ? ' (censured)' : ''}
          {data.is_outlaw ? ' (outlaw)' : ''}
        </span>
      </div>
      <p
        className={`CityAssembly__quorum ${data.quorate ? 'CityAssembly__good' : 'CityAssembly__bad'}`}
      >
        {data.quorate
          ? '✓ QUORUM MET - motions will resolve as voted'
          : `✗ QUORUM NOT MET - ${data.quorum_voters} voices required, only ${data.voter_count} cast. Status quo holds if the session resolves now.`}
      </p>

      {data.is_alderman && data.warrant ? (
        <AldermanWrit warrant={data.warrant} />
      ) : null}

      <Election canVote={canVote} />
      <BracketMotion
        label="Trade"
        hint="Set the Alderman's daily Crown spending cap."
        motion="trade_auth"
        brackets={data.trade_brackets}
        suffix="m"
        tally={data.tallies?.trade_auth}
        disabled={!canVote}
      />
      <BracketMotion
        label="Defense"
        hint="Set the Alderman's daily Pledge cap for defense writs."
        motion="defense_auth"
        brackets={data.defense_brackets}
        suffix="p"
        tally={data.tallies?.defense_auth}
        disabled={!canVote}
      />
      {data.current_alderman ? (
        <>
          <YaeNayMotion
            label="Recall"
            hint={`Remove ${data.current_alderman} from office. ${data.recall_threshold_pct}% YAE carries.`}
            motion="recall"
            tally={data.tallies?.recall}
            disabled={!canVote}
          />
          <YaeNayMotion
            label="Censure"
            hint={`Strike ${data.current_alderman}'s name - barred from office for the round. ${data.censure_threshold_pct}% YAE carries.`}
            motion="censure"
            tally={data.tallies?.censure}
            disabled={!canVote}
          />
        </>
      ) : null}

      <section className="CityAssembly__record">
        <button
          type="button"
          aria-expanded={historyOpen}
          aria-controls="assembly-record"
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          {historyOpen ? 'Hide record' : 'Show record'} ({data.history.length})
        </button>
        {historyOpen && (
          <div id="assembly-record">
            {!data.history.length && (
              <p>No sessions have yet been written into the record.</p>
            )}
            {data.history.map((entry) => (
              <article key={entry.session}>
                <h2>
                  Session {entry.session} &mdash; Day {entry.day}
                </h2>
                <div dangerouslySetInnerHTML={{ __html: entry.text }} />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

const AldermanWrit = ({ warrant }: { warrant: Warrant }) => {
  const { act } = useBackend<AssemblyData>();
  const canTrade = warrant.trade_remaining > 0;
  return (
    <section className="CityAssembly__writ" aria-labelledby="assembly-writ">
      <h2 id="assembly-writ">Alderman&apos;s Writ</h2>
      <dl>
        <div>
          <dt>Trade warrant</dt>
          <dd>
            <b>{warrant.trade_remaining}m</b> of {warrant.trade_cap}m remaining
            today
          </dd>
        </div>
        <div>
          <dt>Defense warrant</dt>
          <dd>
            <b>{warrant.defense_remaining}p</b> of {warrant.defense_cap}p
            remaining today
          </dd>
        </div>
      </dl>
      <div className="CityAssembly__actions">
        <button
          type="button"
          disabled={!canTrade}
          onClick={() => act('alderman_trade')}
          title={
            canTrade
              ? "Open the Nerve Master's trade panel under the Alderman's writ. Draws from the trade warrant, not the Crown's Purse."
              : 'The Commons have set no trade warrant for you, or its coin is spent for the day.'
          }
        >
          Alderman — Trade
        </button>
        <button
          type="button"
          className="CityAssembly__bad"
          onClick={() => act('resign_alderman')}
        >
          Resign the seat
        </button>
      </div>
    </section>
  );
};

const Election = ({ canVote }: { canVote: boolean }) => {
  const { act, data } = useBackend<AssemblyData>();
  const [standOpen, setStandOpen] = useState(false);
  const [pledgeDraft, setPledgeDraft] = useState('');
  const pledgeOpener = useRef<HTMLButtonElement>(null);
  const pledgeInput = useRef<HTMLTextAreaElement>(null);
  const myCandidate = data.candidates.find((candidate) => candidate.is_me);
  const mySelection = data.my_votes?.election;
  const tally = data.tallies?.election;
  const canStand = !!data.can_stand;

  useEffect(() => {
    if (standOpen && canStand) pledgeInput.current?.focus();
  }, [standOpen, canStand]);
  useEffect(() => {
    if (!canStand) setStandOpen(false);
  }, [canStand]);

  const leader =
    tally?.leader_key === 'NO_ALDERMAN'
      ? 'NO ALDERMAN'
      : data.candidates.find((candidate) => candidate.ref === tally?.leader_key)
          ?.name;

  return (
    <fieldset className="CityAssembly__motion CityAssembly__election">
      <legend>Alderman</legend>
      {!data.candidates.length && <p>No one has stood yet.</p>}
      {data.candidates.map((candidate) => (
        <div className="CityAssembly__candidate" key={candidate.ref}>
          <button
            type="button"
            aria-label={`Vote for ${candidate.name}`}
            aria-pressed={mySelection === candidate.ref}
            disabled={!canVote}
            onClick={() =>
              act('cast_vote', { motion: 'election', choice: candidate.ref })
            }
          >
            {mySelection === candidate.ref ? '[x]' : '[ ]'}
          </button>
          <div className="CityAssembly__candidate-copy">
            <div className="CityAssembly__candidate-name">
              <strong>{candidate.name}</strong>
              <span>&ldquo;{candidate.job}&rdquo;</span>
              {candidate.is_alderman ? (
                <span className="CityAssembly__amber">(sitting)</span>
              ) : null}
              {candidate.is_me ? <span>(you)</span> : null}
              <span>[{formatWeight(tally?.tally?.[candidate.ref] ?? 0)}]</span>
            </div>
            <p className="CityAssembly__pledge">
              {candidate.pledge || <i>(no pledge)</i>}
            </p>
          </div>
        </div>
      ))}
      <div className="CityAssembly__actions">
        <button
          type="button"
          aria-label="Vote for no Alderman"
          aria-pressed={mySelection === 'NO_ALDERMAN'}
          disabled={!canVote}
          onClick={() =>
            act('cast_vote', { motion: 'election', choice: 'NO_ALDERMAN' })
          }
        >
          {mySelection === 'NO_ALDERMAN' ? '[x]' : '[ ]'} NO ALDERMAN{' '}
          <span>[{formatWeight(tally?.tally?.NO_ALDERMAN ?? 0)}]</span>
        </button>
        {mySelection && <ClearVote motion="election" />}
      </div>
      {leader && !!tally?.total && (
        <p className="CityAssembly__preview">
          &rarr; {leader} leads ({formatWeight(tally.total)} total weight)
        </p>
      )}
      {canStand && (
        <div className="CityAssembly__candidacy">
          <div className="CityAssembly__actions">
            <button
              type="button"
              ref={pledgeOpener}
              aria-expanded={standOpen}
              aria-controls="assembly-pledge"
              onClick={() => {
                if (standOpen) {
                  setStandOpen(false);
                } else {
                  setPledgeDraft(myCandidate?.pledge ?? '');
                  setStandOpen(true);
                }
              }}
            >
              {myCandidate ? 'Update my pledge...' : 'Stand for the chair...'}
            </button>
          </div>
          {standOpen && (
            <form
              id="assembly-pledge"
              className="CityAssembly__editor"
              onSubmit={(event) => {
                event.preventDefault();
                act('declare_candidacy', { pledge: pledgeDraft });
              }}
            >
              <textarea
                ref={pledgeInput}
                aria-label="Your candidacy pledge"
                value={pledgeDraft}
                onChange={(event) => setPledgeDraft(event.currentTarget.value)}
                maxLength={300}
                rows={3}
                placeholder="Your pledge (max 300 characters)..."
              />
              <div className="CityAssembly__actions">
                <button type="submit">
                  {myCandidate ? 'Update' : 'Declare'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStandOpen(false);
                    pledgeOpener.current?.focus();
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {myCandidate && !standOpen && (
        <button
          type="button"
          className="CityAssembly__bad"
          onClick={() => act('withdraw_candidacy')}
        >
          Withdraw my candidacy
        </button>
      )}
    </fieldset>
  );
};

const ClearVote = ({ motion }: { motion: string }) => {
  const { act } = useBackend<AssemblyData>();
  return (
    <button type="button" onClick={() => act('retract_vote', { motion })}>
      clear
    </button>
  );
};

type MotionProps = {
  label: string;
  hint: string;
  motion: string;
  disabled: boolean;
};

const BracketMotion = ({
  label,
  hint,
  motion,
  disabled,
  brackets,
  suffix,
  tally,
}: MotionProps & {
  brackets: number[];
  suffix: string;
  tally?: BracketTally;
}) => {
  const { act, data } = useBackend<AssemblyData>();
  const total = tally?.total ?? 0;
  const preview =
    !tally || !total
      ? 'No votes yet.'
      : tally.vetoed
        ? `Would be vetoed (NAE >= ${data.nae_veto_pct}% of ${formatWeight(total)} cast)`
        : tally.winning_bracket !== null && tally.winning_bracket !== undefined
          ? `Would carry at ${tally.winning_bracket}${suffix}/day (${formatWeight(total)} cast)`
          : `No bracket carries - ${formatWeight(total)} cast`;
  const myVote = data.my_votes?.[motion];
  return (
    <fieldset
      className="CityAssembly__motion"
      aria-describedby={`assembly-${motion}-hint`}
    >
      <legend>{label}</legend>
      <div className="CityAssembly__actions">
        {['NAE', ...brackets.map(String)].map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            aria-pressed={myVote === choice}
            onClick={() => act('cast_vote', { motion, choice })}
          >
            {choice}
            {choice === 'NAE' ? '' : suffix}{' '}
            <span>
              [
              {formatWeight(
                choice === 'NAE'
                  ? (tally?.nae ?? 0)
                  : (tally?.tally?.[choice] ?? 0),
              )}
              ]
            </span>
          </button>
        ))}
        {myVote && <ClearVote motion={motion} />}
      </div>
      <p className="CityAssembly__preview">
        &rarr; {!data.quorate && total > 0 ? 'If quorum is met: ' : ''}
        {preview}
      </p>
      <p id={`assembly-${motion}-hint`} className="CityAssembly__hint">
        {hint}
      </p>
    </fieldset>
  );
};

const YaeNayMotion = ({
  label,
  hint,
  motion,
  disabled,
  tally,
}: MotionProps & { tally?: YaeNayTally }) => {
  const { act, data } = useBackend<AssemblyData>();
  const yae = formatWeight(tally?.yae ?? 0);
  const nay = formatWeight(tally?.nay ?? 0);
  const preview =
    !tally || !tally.count
      ? 'No votes yet.'
      : `Would ${tally.would_pass ? 'pass' : 'fail'} (${yae} YAE vs ${nay} NAY)`;
  const myVote = data.my_votes?.[motion];
  return (
    <fieldset
      className="CityAssembly__motion"
      aria-describedby={`assembly-${motion}-hint`}
    >
      <legend>{label}</legend>
      <div className="CityAssembly__actions">
        {['YAE', 'NAY'].map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            aria-pressed={myVote === choice}
            onClick={() => act('cast_vote', { motion, choice })}
          >
            {choice} <span>[{choice === 'YAE' ? yae : nay}]</span>
          </button>
        ))}
        {myVote && <ClearVote motion={motion} />}
      </div>
      <p className="CityAssembly__preview">
        &rarr; {!data.quorate && tally?.count ? 'If quorum is met: ' : ''}
        {preview}
      </p>
      <p id={`assembly-${motion}-hint`} className="CityAssembly__hint">
        {hint} Requires {data.removal_voters} voters and{' '}
        {formatWeight(data.removal_weight_doubled)} total weight.
      </p>
    </fieldset>
  );
};
