import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { type Controller, label, targetKind, controlKey } from './model';
export function ReactView({ controller }: { controller: Controller }) {
  const s = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const search = useRef<HTMLInputElement>(null),
    body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (s.searchBarVisible) search.current?.focus();
    else body.current?.focus();
  }, [s.searchBarVisible, s.searchFocus]);
  useEffect(() => {
    body.current
      ?.querySelector(`[data-index="${s.selected}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [s.selected, s.searchQuery]);
  if (s.closed) return null;
  return (
    <section
      className="TithewoodSurface SelectionPrompt"
      aria-label="Selection prompt"
    >
      <header className="SelectionPrompt__titlebar">
        <div>
          <p className="SelectionPrompt__eyebrow">
            Tithewood / selection study
          </p>
          <h1>{s.data.title ?? 'Select'}</h1>
        </div>
        <button
          type="button"
          className="TithewoodControl"
          data-testid="close"
          aria-label="Close sample window"
          onClick={controller.close}
        >
          ×
        </button>
      </header>
      {!!s.data.timeout && (
        <progress
          data-testid="timeout"
          className="SelectionPrompt__timeout"
          aria-label="Delivered time remaining"
          max="1"
          value={Math.min(1, Math.max(0, s.data.timeout))}
        />
      )}
      <div
        ref={body}
        data-testid="content"
        className="SelectionPrompt__body"
        tabIndex={-1}
        onKeyDown={(e) => controller.key(e, targetKind(e.target))}
      >
        <div className="SelectionPrompt__prompt">
          <p data-testid="prompt">{s.data.message ?? ''}</p>
          <button
            type="button"
            data-control
            data-testid="search-toggle"
            className="TithewoodControl"
            aria-pressed={s.searchBarVisible}
            title={
              s.searchBarVisible
                ? 'Hide search; use letters to jump to choices'
                : 'Search choices'
            }
            onKeyDown={(e) => controlKey(e, controller.toggleSearch, false)}
            onClick={controller.toggleSearch}
          >
            Search
          </button>
        </div>
        {s.searchBarVisible && (
          <label className="SelectionPrompt__search">
            Search choices
            <input
              key={s.searchFocus}
              ref={search}
              className="TithewoodControl"
              data-testid="search"
              placeholder="Search choices..."
              value={s.searchQuery}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' ||
                  e.key === 'Escape' ||
                  e.key === 'Esc'
                ) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              onChange={(e) => controller.query(e.target.value)}
            />
          </label>
        )}
        <div className="SelectionPrompt__choices" aria-label="Choices">
          {s.filteredItems.length ? (
            s.filteredItems.map((item, index) => (
              <div
                role="button"
                tabIndex={0}
                key={index}
                data-testid="option"
                data-entry={item}
                data-index={index}
                className="SelectionPrompt__option"
                aria-pressed={index === s.selected}
                onFocus={() => controller.select(item)}
                onClick={() => controller.select(item)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  controller.submitEntry(item);
                }}
              >
                <span aria-hidden="true">
                  {index === s.selected ? '✓' : '◇'}
                </span>
                <span>{label(item)}</span>
              </div>
            ))
          ) : (
            <p className="SelectionPrompt__empty">
              No choices match your search.
            </p>
          )}
        </div>
        <p className="SelectionPrompt__hint">
          {s.filteredItems.length}{' '}
          {s.filteredItems.length === 1 ? 'choice' : 'choices'} · ↑ ↓ to
          navigate · Enter to confirm
        </p>
        <footer
          data-control
          className={`SelectionPrompt__footer${s.data.large_buttons ? ' SelectionPrompt__footer--large' : ''}`}
        >
          {s.data.enable_preview && (
            <button
              type="button"
              data-testid="preview"
              className="TithewoodControl"
              disabled={!s.data.previewing && s.selectedItem === undefined}
              onKeyDown={(e) =>
                controlKey(
                  e,
                  controller.preview,
                  !s.data.previewing && s.selectedItem === undefined,
                )
              }
              onClick={controller.preview}
            >
              {s.data.previewing ? 'Stop' : 'Listen'}
            </button>
          )}
          <div
            className={`SelectionPrompt__buttons${s.data.swapped_buttons ? ' SelectionPrompt__buttons--swapped' : ''}`}
          >
            <button
              type="button"
              data-testid="confirm"
              className="TithewoodControl"
              disabled={s.selectedItem === undefined}
              onKeyDown={(e) =>
                controlKey(e, controller.submit, s.selectedItem === undefined)
              }
              onClick={controller.submit}
            >
              Confirm
            </button>
            <button
              type="button"
              data-testid="cancel"
              className="TithewoodControl"
              onKeyDown={(e) => controlKey(e, controller.cancel, false)}
              onClick={controller.cancel}
            >
              Cancel
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
