import React, { useEffect, useRef, useSyncExternalStore } from 'react';

import credits from './credits.html' with { type: 'text' };
import { type Controller, project } from './model';
export function ReactView({ controller }: { controller: Controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const view = project(state);
  const search = useRef<HTMLInputElement>(null),
    entries = useRef<HTMLDivElement>(null);
  useEffect(() => {
    controller.mount();
    return () => controller.unmount();
  }, [controller]);
  const select = (index: number) => {
    if (entries.current) entries.current.scrollTop = 0;
    controller.select(index);
  };
  return (
    <main className="TithewoodSurface ChangesArchive">
      <header>
        <p className="ChangesArchive__eyebrow">Tithewood / archive study</p>
        <h1>Changelog</h1>
        <nav aria-label="Changelog month">
          {controller.dates.length > 0 && (
            <>
              <button
                type="button"
                className="TithewoodControl"
                aria-label="Newer month"
                title="Newer month"
                disabled={state.selectedIndex === 0}
                onClick={() => select(state.selectedIndex - 1)}
              >
                ‹
              </button>
              <select
                className="TithewoodControl"
                aria-label="Archive month"
                value={state.selectedIndex}
                onChange={(e) => select(Number(e.currentTarget.value))}
              >
                {controller.labels.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="TithewoodControl"
                aria-label="Older month"
                title="Older month"
                disabled={state.selectedIndex === controller.dates.length - 1}
                onClick={() => select(state.selectedIndex + 1)}
              >
                ›
              </button>
            </>
          )}
        </nav>
        <div className="ChangesArchive__search">
          <input
            className="TithewoodControl"
            ref={search}
            aria-label="Search this month"
            placeholder="Search author, description, or category..."
            value={state.query}
            onInput={(e) => controller.query(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className="TithewoodControl"
            aria-label="Clear search"
            disabled={!state.query}
            onClick={() => {
              controller.query('');
              search.current?.focus();
            }}
          >
            Clear
          </button>
        </div>
        {view.summary !== null && <p role="status">{view.summary}</p>}
      </header>
      <div className="ChangesArchive__entries" ref={entries}>
        <aside aria-label="Historical upstream credits">
          <p className="ChangesArchive__creditNote">
            Historical upstream credits and license notices; not Tithewood
            support links.
          </p>
          {/* Trusted static production credits only, never archive/user data. */}
          {/* eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: credits }} />
        </aside>
        {view.days.map((day) => (
          <section className="ChangesArchive__day" key={day.date}>
            <h2>{day.label}</h2>
            {day.authors.map((author) => (
              <div key={author.name}>
                <h3>{author.name}</h3>
                <div role="table">
                  {author.rows.map((row) => (
                    <div role="row" key={row.index}>
                      <div role="cell" className="ChangesArchive__category">
                        {row.category || 'unknown'}
                      </div>
                      <div role="cell" className="ChangesArchive__description">
                        {row.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        {view.status !== null && (
          <p className="ChangesArchive__status">{view.status}</p>
        )}
        {view.status === 'Failed to load data after 6 attempts' && (
          <button
            type="button"
            className="TithewoodControl"
            onClick={() => select(state.selectedIndex)}
          >
            Retry this month
          </button>
        )}
      </div>
    </main>
  );
}
