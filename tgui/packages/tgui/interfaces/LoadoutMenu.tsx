import { useMemo, useState } from 'react';
import { Box, Button, Input } from 'tgui-core/components';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../backend';
import { Window } from '../layouts';

type LoadoutItem = {
  name: string;
  category: string;
  desc: string;
  cost: number;
  type: string;
  nobility_check: BooleanLike;
  donoritem: BooleanLike;
  ref: string;
  icon: string;
};

type Data = {
  loadout_items: LoadoutItem[];
  current_slot: number;
  total_points: number;
  available_points: number;
  selected_slots: Record<string, number>;
};

export const LoadoutMenu = () => {
  const { act, data } = useBackend<Data>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const { current_slot, total_points, available_points, selected_slots } = data;
  const items = useMemo(
    () => data.loadout_items.filter((item) => item.nobility_check && item.donoritem),
    [data.loadout_items],
  );
  const categories = useMemo(
    () => ['All', ...new Set(items.map((item) => item.category).sort())],
    [items],
  );
  const activeCategory = categories.includes(category) ? category : 'All';
  const currentItem = data.loadout_items.find(
    (item) => selected_slots[item.type] === current_slot,
  );
  const query = search.trim().toLowerCase();
  const matches = items.filter(
    (item) =>
      (activeCategory === 'All' || item.category === activeCategory) &&
      (!query || `${item.name} ${item.desc}`.toLowerCase().includes(query)),
  );

  return (
    <Window width={880} height={650}>
      <Window.Content className="LoadoutMenu">
        <header className="LoadoutMenu__header">
          <div>
            <h1>Loadout</h1>
          </div>
          <div className="LoadoutMenu__budget">
            <div className="LoadoutMenu__eyebrow">Available for this slot</div>
            <div>
              <strong>{available_points}</strong>
              <span> / {total_points} points</span>
            </div>
            <small>{currentItem ? 'Includes the cost of your current item' : 'Loadout points remaining'}</small>
          </div>
        </header>
        <div className="LoadoutMenu__selection">
          <div className="LoadoutMenu__slot">
            Slot <strong>{current_slot}</strong><span> / 10</span>
          </div>
          {currentItem && (
            <div className="LoadoutMenu__currentIcon"><Box className={currentItem.icon} /></div>
          )}
          <div className="LoadoutMenu__currentItem">
            <span className="LoadoutMenu__eyebrow">{currentItem ? 'Current item' : 'Empty slot'}</span>
            <strong>{currentItem?.name || 'Choose a belonging below'}</strong>
          </div>
          <span className="LoadoutMenu__selectionHint">
            {currentItem ? 'Choosing another item replaces this one.' : 'One belonging per slot.'}
          </span>
        </div>
        <div className="LoadoutMenu__body">
          <nav className="LoadoutMenu__categories" aria-label="Item categories">
            <div className="LoadoutMenu__eyebrow">Categories</div>
            {categories.map((name) => (
              <Button
                key={name}
                fluid
                selected={activeCategory === name}
                onClick={() => setCategory(name)}>
                <span className="LoadoutMenu__categoryName">{name === 'All' ? 'All belongings' : name}</span>
                <span className="LoadoutMenu__count">
                  {name === 'All' ? items.length : items.filter((item) => item.category === name).length}
                </span>
              </Button>
            ))}
          </nav>
          <main className="LoadoutMenu__catalogue">
            <div className="LoadoutMenu__search">
              <Input
                fluid
                aria-label="Search belongings"
                placeholder="Search names and descriptions..."
                value={search}
                onChange={setSearch}
              />
              <Button disabled={!search} onClick={() => setSearch('')}>
                Clear
              </Button>
            </div>
            <div className="LoadoutMenu__listHeading">
              <h2>{activeCategory === 'All' ? 'All belongings' : activeCategory}</h2>
              <span>{matches.length} {matches.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="LoadoutMenu__items">
              {matches.map((item) => {
                const slot = selected_slots[item.type];
                const chosen = slot === current_slot;
                const elsewhere = !!slot && !chosen;
                const tooExpensive = item.cost > available_points;
                return (
                  <article
                    className={`LoadoutMenu__item${chosen ? ' LoadoutMenu__item--chosen' : ''}${elsewhere || tooExpensive ? ' LoadoutMenu__item--unavailable' : ''}`}
                    key={item.ref}>
                    <div className="LoadoutMenu__icon"><Box className={item.icon} /></div>
                    <div className="LoadoutMenu__itemDetails">
                      <div className="LoadoutMenu__itemHeading">
                        <h3>{item.name}</h3>
                        {chosen && <span className="LoadoutMenu__packed">Packed</span>}
                      </div>
                      <small>{item.category}</small>
                      <p>{item.desc || 'A personal belonging.'}</p>
                    </div>
                    <div className="LoadoutMenu__itemFooter">
                      <span className={`LoadoutMenu__price${tooExpensive ? ' LoadoutMenu__unaffordable' : ''}`}>
                        <strong>{item.cost}</strong> {item.cost === 1 ? 'point' : 'points'}
                      </span>
                      <Button
                        selected={chosen}
                        disabled={elsewhere || tooExpensive}
                        tooltip={elsewhere ? `Already in slot ${slot}` : tooExpensive ? 'Not enough loadout points' : undefined}
                        onClick={() => act('choose_item', { ref: item.ref })}>
                        {elsewhere ? `In slot ${slot}` : tooExpensive ? 'Over budget' : chosen ? 'Keep item' : currentItem ? 'Replace' : 'Choose'}
                      </Button>
                    </div>
                  </article>
                );
              })}
              {!matches.length && (
                <div className="LoadoutMenu__empty">
                  <h2>No belongings found</h2>
                  <p>Try another category or a shorter search.</p>
                  <Button onClick={() => { setSearch(''); setCategory('All'); }}>
                    Show all items
                  </Button>
                </div>
              )}
            </div>
          </main>
        </div>
        <footer className="LoadoutMenu__footer">
          Names, descriptions, colours and starting equipment are set on the Belongings tab.
        </footer>
      </Window.Content>
    </Window>
  );
};
