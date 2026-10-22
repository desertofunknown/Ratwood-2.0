import React, { useId } from 'react';
import type { SettingsViewProps } from './model';

export function ReactView({ data, onToggle, onSelect }: SettingsViewProps) {
  const prefix = useId();
  return (
    <section className="TithewoodSurface DisplayReadability">
      <h2 className="DisplayReadability__title">Display &amp; Readability</h2>
      <p className="DisplayReadability__scope">
        In game, these controls save account preferences except TGUI Multiline,
        which affects only the current mob. This sample cannot verify saving or
        native effects.
      </p>
      {data.categories.map((category, categoryIndex) => (
        <section
          key={category.name}
          className="DisplayReadability__category"
          data-category-name={category.name}
          aria-labelledby={`${prefix}-category-${categoryIndex}`}
        >
          <h3 id={`${prefix}-category-${categoryIndex}`}>{category.name}</h3>
          {category.entries.map((entry) => (
            <div
              key={entry.id}
              className="DisplayReadability__row"
              data-setting-id={entry.id}
            >
              <button
                type="button"
                className="TithewoodControl DisplayReadability__toggle"
                data-toggle-id={entry.id}
                aria-pressed={Boolean(entry.enabled)}
                aria-describedby={`${prefix}-description-${entry.id}`}
                onClick={() => onToggle(entry.id)}
              >
                <span>{entry.label}</span>
                <span className="DisplayReadability__state" aria-hidden="true">
                  {entry.enabled ? 'On' : 'Off'}
                </span>
              </button>
              <p
                id={`${prefix}-description-${entry.id}`}
                className="DisplayReadability__description"
              >
                {entry.desc}
              </p>
              {entry.id === 'tgui_multiline' && (
                <p className="DisplayReadability__transient">
                  Current mob only in game
                </p>
              )}
            </div>
          ))}
          {(category.selects || []).map((entry) => (
            <fieldset
              key={entry.id}
              className="DisplayReadability__palette"
              data-setting-id={entry.id}
              data-select-id={entry.id}
              aria-describedby={`${prefix}-description-${entry.id}`}
            >
              <legend>{entry.label}</legend>
              <p
                id={`${prefix}-description-${entry.id}`}
                className="DisplayReadability__description"
              >
                {entry.desc}
              </p>
              <div className="DisplayReadability__options">
                {(Array.isArray(entry.options) ? entry.options : []).map(
                  (option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="TithewoodControl"
                      aria-pressed={entry.value === option.value}
                      aria-describedby={`${prefix}-description-${entry.id}`}
                      data-option-value={option.value}
                      onClick={() => onSelect(entry.id, option.value)}
                    >
                      {option.label}
                    </button>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </section>
      ))}
    </section>
  );
}
