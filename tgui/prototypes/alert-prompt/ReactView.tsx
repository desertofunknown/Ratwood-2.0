import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Controller } from './model';

/** Matches the core Autofocus mount timer, without moving focus on selection. */
function Autofocus() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.focus(), 1);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="AlertPrompt__autofocus"
      data-alert-autofocus
    />
  );
}

export function ReactView({ controller }: { controller: Controller }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (s.closed) return null;
  const reversed = !s.data.swapped_buttons;
  const large = !!s.data.large_buttons;
  const timeout = Math.min(1, Math.max(0, s.data.timeout ?? 0));
  return (
    <section
      className="AlertPrompt TithewoodSurface"
      aria-label="Alert prompt"
      style={{ maxWidth: s.windowWidth }}
      data-window-height={s.windowHeight}
    >
      <header className="AlertPrompt__header">
        <div>
          <p className="AlertPrompt__eyebrow">Tithewood / alert study</p>
          <h1>{s.data.title}</h1>
        </div>
        <button
          type="button"
          className="TithewoodControl"
          data-alert-close
          aria-label="Close sample window"
          onClick={controller.close}
        >
          ×
        </button>
      </header>
      {s.timeoutVisible && (
        <div
          className="AlertPrompt__timeout"
          role="progressbar"
          aria-label="Delivered time remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={timeout * 100}
          data-alert-timeout
        >
          <div
            className="AlertPrompt__timeout-progress"
            style={{ width: `${timeout * 100}%` }}
          />
        </div>
      )}
      <div
        className="AlertPrompt__content"
        data-alert-content
        role="group"
        tabIndex={-1}
        onKeyDown={controller.keyDown}
      >
        <div className="AlertPrompt__message" data-alert-message>
          {s.message}
        </div>
        <footer
          className="AlertPrompt__footer"
          data-verbose={String(s.verbose)}
          data-reversed={String(reversed)}
          data-large-buttons={String(large)}
          data-large={String(large)}
          style={{
            flexDirection: s.verbose
              ? reversed
                ? 'column-reverse'
                : 'column'
              : reversed
                ? 'row-reverse'
                : 'row',
          }}
        >
          {!!s.data.autofocus && <Autofocus />}
          <React.Fragment key={String(s.verbose)}>
            {s.buttons.map((button, index) => (
              <button
                key={index}
                type="button"
                className="TithewoodControl AlertPrompt__choice"
                data-alert-choice={index}
                aria-label={
                  button.trim().length === 0
                    ? `Empty choice ${index + 1}`
                    : undefined
                }
                aria-pressed={s.selected === index}
                onFocus={() => controller.focus(index)}
                onClick={() => controller.choose(index)}
              >
                {button}
              </button>
            ))}
          </React.Fragment>
        </footer>
      </div>
    </section>
  );
}
