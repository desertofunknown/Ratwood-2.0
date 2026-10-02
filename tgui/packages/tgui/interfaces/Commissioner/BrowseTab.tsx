import { useEffect, useMemo, useRef, useState } from 'react';

import type { ActFn, CommissionerData } from './types';

const ALL = '__all__';
const PAGE_SIZE = 40;
const DEFAULT_GROUP_ORDER = ['Armor', 'Weapons', 'Tools', 'Valuables', 'Decoration', 'Engineering', 'Other'];

const groupFor = (category: string, order: string[]): string => {
  const paren = category.indexOf(' (');
  const head = paren === -1 ? category : category.slice(0, paren);
  return order.includes(head) ? head : 'Other';
};

const starsIf = (text: string, canRead: boolean) =>
  canRead ? text : text.replace(/[A-Za-z0-9]/g, '*');

export const BrowseTab = (props: { data: CommissionerData; act: ActFn; canRead: boolean }) => {
  const { data, act, canRead } = props;
  const [category, setCategory] = useState<string>(ALL);
  const [ingot, setIngot] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const groupOrder = data.group_order?.length ? data.group_order : DEFAULT_GROUP_ORDER;
  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const cat of data.categories) {
      const group = groupFor(cat, groupOrder);
      (groups[group] ||= []).push(cat);
    }
    for (const group of Object.keys(groups)) groups[group].sort();
    return groups;
  }, [data.categories, groupOrder]);
  const activeGroup = category === ALL ? null : groupFor(category, groupOrder);
  useEffect(() => {
    if (activeGroup) setOpenGroups((previous) => ({ ...previous, [activeGroup]: true }));
  }, [activeGroup]);
  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return data.catalog.filter((entry) =>
      (category === ALL || entry.category === category) &&
      (ingot === ALL || entry.ingot === ingot) &&
      (!needle || entry.name.toLowerCase().includes(needle)),
    );
  }, [data.catalog, category, ingot, search]);
  useEffect(() => { setPage(0); }, [category, ingot, search]);
  const manifestQty = useMemo(() => {
    const quantities: Record<string, number> = {};
    for (const line of data.manifest) quantities[line.ref] = line.qty;
    return quantities;
  }, [data.manifest]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const displayed = filtered.slice(start, start + PAGE_SIZE);
  useEffect(() => { if (rowsRef.current) rowsRef.current.scrollTop = 0; }, [safePage, category, ingot, search]);

  return (
    <div className="Commissioner__browse">
      <aside className="Commissioner__categories" aria-label="Recipe categories" tabIndex={0}>
        <h2>Categories</h2>
        <button type="button" aria-pressed={category === ALL} onClick={() => setCategory(ALL)}>
          All recipes <span>{data.catalog.length}</span>
        </button>
        {groupOrder.map((group) => {
          const categories = grouped[group];
          if (!categories?.length) return null;
          const expanded = !!openGroups[group];
          return (
            <div className="Commissioner__categoryGroup" key={group}>
              <button
                type="button"
                className="Commissioner__groupToggle"
                aria-expanded={expanded}
                onClick={() => setOpenGroups((previous) => ({ ...previous, [group]: !previous[group] }))}
              >
                <span>{expanded ? '▾' : '▸'} {group}</span>
                <span>{categories.length}</span>
              </button>
              {expanded && categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  className="Commissioner__subcategory"
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
                >
                  {cat.includes(' (') ? cat.slice(cat.indexOf('(') + 1, -1) : cat}
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      <section className="Commissioner__catalogue">
        <div className="Commissioner__searchbar">
          <label className="Commissioner__search">
            <span>Find a recipe</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search by item name…" />
          </label>
          {data.ingots.length > 0 && (
            <label className="Commissioner__materialFilter">
              <span>Material</span>
              <select value={ingot} onChange={(event) => setIngot(event.currentTarget.value)}>
                <option value={ALL}>Any material</option>
                {data.ingots.map((material) => <option key={material} value={material}>{material}</option>)}
              </select>
            </label>
          )}
          {(search || category !== ALL || ingot !== ALL) && (
            <button type="button" onClick={() => { setSearch(''); setCategory(ALL); setIngot(ALL); }}>Reset filters</button>
          )}
        </div>
        <div className="Commissioner__catalogueHeading">
          <div><h2>{category === ALL ? 'Available recipes' : category}</h2><span>{filtered.length} matching recipes</span></div>
          <span>{data.my_manifest_items} / {data.item_cap_per_order} items in manifest</span>
        </div>
        <div className="Commissioner__catalogueRows" ref={rowsRef} tabIndex={0} aria-label="Available recipes">
          {displayed.length === 0 ? (
            <div className="Commissioner__empty">
              <h2>{data.catalog.length === 0 ? 'No recipes available' : 'No matching recipes'}</h2>
              <p>{data.catalog.length === 0 ? 'The catalogue has no available work to commission.' : 'Try another name, category, or material.'}</p>
            </div>
          ) : displayed.map((entry) => (
            <div className="Commissioner__recipe" key={entry.ref}>
              <div className="Commissioner__recipeName">
                <strong>{starsIf(entry.name, canRead)}</strong>
                <span>{entry.category}{entry.ingot ? ` · ${entry.ingot}` : ''}</span>
                {canRead && entry.materials.length > 0 && <small>Materials: {entry.materials.map((material) => `${material.qty} ${material.name}`).join(' · ')}</small>}
              </div>
              <div className="Commissioner__price"><strong>{entry.price}m</strong></div>
              <div className="Commissioner__add">
                <button type="button" disabled={!data.locked} title={!data.locked ? 'The machine is closed for guild adjustments.' : undefined} aria-label={`Add ${starsIf(entry.name, canRead)} to manifest`} onClick={() => act('manifest_inc', { ref: entry.ref, delta: 1 })}>Add</button>
                {!!manifestQty[entry.ref] && <span>{manifestQty[entry.ref]} in manifest</span>}
              </div>
            </div>
          ))}
        </div>
        <footer className="Commissioner__pagination">
          <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>Previous</button>
          <span>{filtered.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 recipes'} · Page {safePage + 1} / {totalPages}</span>
          <button type="button" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
        </footer>
      </section>
    </div>
  );
};
