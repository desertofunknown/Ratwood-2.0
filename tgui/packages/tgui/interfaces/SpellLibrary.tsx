import { useMemo, useState } from 'react';
import { Icon } from 'tgui-core/components';

import { useBackend } from '../backend';
import { Window } from '../layouts';

type SpellDetails = {
  name: string;
  desc: string;
  cost: number;
  tier: number;
  path: string;
  school?: string;
  charge_time?: number;
  cooldown?: number;
  fatigue?: number;
  img64?: string;
};
type SpellState = {
  path: string;
  is_known: boolean;
  can_afford: boolean;
  tier_locked: boolean;
  evil_locked: boolean;
};
type Spell = SpellDetails & SpellState;
type Data = {
  user_points?: number;
  spell_catalogue: SpellDetails[];
  spells: SpellState[];
};

const spellStatus = (spell: Spell) =>
  spell.is_known ? 'Learned'
    : spell.tier_locked ? 'Requires tier ' + spell.tier
      : spell.evil_locked ? 'Requires heresy'
        : !spell.can_afford ? 'Not enough weave points'
          : 'Ready to weave';

const SpellIcon = ({ spell }: { spell: Spell }) => (
  <span className="SpellLibrary__icon" aria-hidden="true">
    {spell.img64 && spell.img64 !== 'blank' ? (
      <img src={'data:image/png;base64,' + spell.img64} alt="" />
    ) : <Icon name="book-open" />}
  </span>
);

export const SpellLibrary = () => {
  const { act, data } = useBackend<Data>();
  const { user_points = 0, spell_catalogue = [], spells: spellStates = [] } = data;
  const catalogue = useMemo(
    () => new Map(spell_catalogue.map((spell) => [spell.path, spell])),
    [spell_catalogue],
  );
  // The live rows decide membership; removed spells never survive in the static catalogue.
  const spells = useMemo(() => spellStates.flatMap((state) => {
    const details = catalogue.get(state.path);
    return details ? [{ ...details, ...state }] : [];
  }), [catalogue, spellStates]);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<number | 'all'>('all');
  const [school, setSchool] = useState('All');
  const [hideKnown, setHideKnown] = useState(false);
  const [sort, setSort] = useState<'tier' | 'asc' | 'desc'>('tier');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const tiers = useMemo(
    () => Array.from(new Set(spells.map((spell) => spell.tier))).sort((a, b) => a - b),
    [spells],
  );
  const schools = useMemo(
    () => Array.from(new Set(spells.map((spell) => spell.school || 'generic'))).sort(),
    [spells],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spells.filter((spell) =>
      (tier === 'all' || spell.tier === tier) &&
      (school === 'All' || (spell.school || 'generic') === school) &&
      (!hideKnown || !spell.is_known) &&
      (!query || (spell.name + ' ' + spell.desc).toLowerCase().includes(query)),
    ).sort((a, b) => sort === 'asc' ? a.cost - b.cost
      : sort === 'desc' ? b.cost - a.cost
      : a.tier - b.tier || a.cost - b.cost);
  }, [spells, search, tier, school, hideKnown, sort]);
  const selected = visible.find((spell) => spell.path === selectedPath) || visible[0];
  const canLearn = selected && !selected.is_known && selected.can_afford &&
    !selected.tier_locked && !selected.evil_locked;
  const learnedCount = spells.filter((spell) => spell.is_known).length;
  const clearFilters = () => {
    setSearch('');
    setTier('all');
    setSchool('All');
    setHideKnown(false);
  };

  return (
    <Window title="Grimoire of Arcane Arts" width={940} height={730}>
      <Window.Content>
        <div className="SpellLibrary">
          <header className="SpellLibrary__header">
            <div>
              <div className="SpellLibrary__eyebrow">The arcane arts</div>
              <h1>Your grimoire</h1>
              <p>Select an incantation to read its effects and requirements.</p>
            </div>
            <div className="SpellLibrary__points">
              <span>Available weave points</span>
              <strong>{user_points}</strong>
              <small>{learnedCount} of {spells.length} spells learned</small>
            </div>
          </header>
          <div className="SpellLibrary__filters">
            <div className="SpellLibrary__searchRow">
              <input aria-label="Search spells and effects" value={search}
                placeholder="Search incantations or effects…"
                onChange={(event) => setSearch(event.currentTarget.value)} />
              <label>
                <span>Order</span>
                <select aria-label="Order spells" value={sort}
                  onChange={(event) => setSort(event.currentTarget.value as typeof sort)}>
                  <option value="tier">Tier, then cost</option>
                  <option value="asc">Lowest cost first</option>
                  <option value="desc">Highest cost first</option>
                </select>
              </label>
              <button type="button" aria-pressed={hideKnown}
                onClick={() => setHideKnown(!hideKnown)}>Hide learned</button>
            </div>
            <div className="SpellLibrary__tierRow">
              <div className="SpellLibrary__tiers" aria-label="Spell tier">
                <button type="button" aria-pressed={tier === 'all'}
                  onClick={() => setTier('all')}>All tiers</button>
                {tiers.map((value) => (
                  <button type="button" key={value} aria-pressed={tier === value}
                    onClick={() => setTier(value)}>Tier {value}</button>
                ))}
              </div>
              {schools.length > 1 && (
                <label>
                  <span>School</span>
                  <select aria-label="Spell school" value={school}
                    onChange={(event) => setSchool(event.currentTarget.value)}>
                    <option value="All">All schools</option>
                    {schools.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="SpellLibrary__body">
            <nav className="SpellLibrary__catalog" aria-label="Incantations">
              <div className="SpellLibrary__count">{visible.length} incantations</div>
              <div className="SpellLibrary__list">
                {visible.map((spell) => (
                  <button type="button" key={spell.path}
                    className="SpellLibrary__entry"
                    aria-pressed={selected?.path === spell.path}
                    onClick={() => setSelectedPath(spell.path)}>
                    <SpellIcon spell={spell} />
                    <span className="SpellLibrary__entryText">
                      <strong>{spell.name}</strong>
                      <span>Tier {spell.tier} · {spell.school || 'generic'} · {spell.cost} points</span>
                      <small className={spell.is_known ? 'SpellLibrary__known' : ''}>
                        {spellStatus(spell)}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </nav>
            {selected ? (
              <section className="SpellLibrary__detail" aria-label="Selected incantation">
                <div className="SpellLibrary__reading" key={selected.path}>
                  <div className="SpellLibrary__spellHeading">
                    <SpellIcon spell={selected} />
                    <div>
                      <div className="SpellLibrary__eyebrow">Tier {selected.tier} · {selected.school || 'generic'}</div>
                      <h2>{selected.name}</h2>
                    </div>
                  </div>
                  <p className="SpellLibrary__description">
                    {selected.desc || 'No description is recorded for this incantation.'}
                  </p>
                  <dl className="SpellLibrary__facts">
                    <div><dt>Weave cost</dt><dd>{selected.cost} points</dd></div>
                    {!!selected.charge_time && <div><dt>Cast time</dt><dd>{selected.charge_time}s</dd></div>}
                    {!!selected.cooldown && <div><dt>Cooldown</dt><dd>{selected.cooldown}s</dd></div>}
                    {!!selected.fatigue && <div><dt>Stamina</dt><dd>{selected.fatigue}</dd></div>}
                  </dl>
                  <div className={'SpellLibrary__status' + (selected.is_known ? ' SpellLibrary__status--known' : '')}>
                    <strong>{spellStatus(selected)}</strong>
                    {selected.is_known ? <p>This incantation is already woven into your mind.</p>
                      : selected.tier_locked ? <p>Your arcane power must reach tier {selected.tier} to learn this spell.</p>
                      : selected.evil_locked ? <p>You lack the forbidden knowledge required for this spell.</p>
                      : !selected.can_afford ? <p>You need {Math.max(0, selected.cost - user_points)} more weave points.</p>
                      : <p>Learning this spell spends {selected.cost} of your {user_points} available weave points.</p>}
                  </div>
                </div>
                <footer className="SpellLibrary__footer">
                  <span>{selected.is_known ? 'Recorded in your grimoire' : selected.cost + ' weave points'}</span>
                  <button type="button" disabled={!canLearn}
                    onClick={() => act('learn', { path: selected.path })}>
                    {selected.is_known ? 'Learned' : 'Weave spell'}
                  </button>
                </footer>
              </section>
            ) : (
              <div className="SpellLibrary__empty">
                <h2>{spells.length ? 'No matching incantations' : 'No incantations available'}</h2>
                {spells.length > 0 && <>
                  <p>Change the tier, school or search to browse your grimoire.</p>
                  <button type="button" onClick={clearFilters}>Clear filters</button>
                </>}
              </div>
            )}
          </div>
        </div>
      </Window.Content>
    </Window>
  );
};
