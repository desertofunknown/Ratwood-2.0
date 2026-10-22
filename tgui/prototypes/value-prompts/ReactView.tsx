import React, { useSyncExternalStore } from 'react';
import { RestrictedInput } from '../../node_modules/tgui-core/dist/components/RestrictedInput.js';
import { TextArea } from '../../node_modules/tgui-core/dist/components/TextArea.js';
import { clamp, controlKey, type Controller } from './model';

/** Disconnected presentation; the real leaf editors retain their local buffers. */
export function ReactView({ controller }: { controller: Controller }) {
  const s = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const text = s.kind === 'text';
  const large = !!s.data.large_buttons;
  const swapped = !!s.data.swapped_buttons;
  if (s.closed) return null;

  const adjustment = (
    testId: string,
    label: string,
    glyph: string,
    action: () => void,
    disabled: boolean,
  ) => (
    <button
      type="button"
      className="TithewoodControl"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => controlKey(event, action, disabled)}
      onClick={() => {
        if (!disabled) action();
      }}
    >
      {glyph}
    </button>
  );
  const blockTransfer = (event: React.SyntheticEvent) => {
    if (s.data.disable_paste) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  return (
    <section
      className={`TithewoodSurface ValuePrompt ValuePrompt--${s.kind}`}
      aria-label={text ? 'Text prompt' : 'Number prompt'}
      style={{ maxWidth: s.windowWidth }}
    >
      <header className="ValuePrompt__titlebar">
        <div>
          <p className="ValuePrompt__eyebrow">Tithewood / value study</p>
          <h1>{s.data.title ?? (text ? 'Enter text' : 'Enter number')}</h1>
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
      {s.timeoutVisible && (
        <div className="ValuePrompt__timeout">
          <div
            className="ValuePrompt__timeout-progress"
            data-testid="timeout"
            role="progressbar"
            aria-label="Delivered time remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clamp(s.data.timeout!, 0, 1) * 100}
            style={{ width: `${clamp(s.data.timeout!, 0, 1) * 100}%` }}
          />
        </div>
      )}
      <div
        className="ValuePrompt__body"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          controller.key(
            event,
            target.closest('.ValuePrompt__footer')
              ? 'footer'
              : target.closest('button')
                ? 'button'
                : 'content',
          );
        }}
      >
        <p className="ValuePrompt__prompt" data-testid="prompt">
          {s.data.message ?? ''}
        </p>
        {text ? (
          <div
            className="ValuePrompt__editor ValuePrompt__text"
            style={{
              height: s.data.bigmodal
                ? 300
                : s.data.multiline
                  ? 225
                  : s.visualMultiline
                    ? 100
                    : undefined,
            }}
            onPaste={blockTransfer}
            onDrop={blockTransfer}
          >
            <TextArea
              autoFocus
              autoSelect
              fluid
              className="TithewoodControl"
              data-testid="input"
              aria-label="Text"
              dontUseTabForIndent={true}
              userMarkup={{ u: '_', i: '|', b: '+' }}
              height={s.visualMultiline ? '100%' : '2.8rem'}
              maxLength={s.data.max_length}
              onChange={controller.setValue}
              placeholder="Type something..."
              value={s.value as string}
            />
          </div>
        ) : (
          <div className="ValuePrompt__editor ValuePrompt__number">
            {adjustment('min', 'Minimum', '≪', controller.min, s.minDisabled)}
            {adjustment(
              'decrease',
              `Decrease by ${s.step}`,
              '−',
              () => controller.adjust(-1),
              s.decreaseDisabled,
            )}
            <RestrictedInput
              autoFocus
              autoSelect
              fluid
              className="TithewoodControl"
              data-testid="input"
              aria-label="Number"
              allowFloats={!s.data.round_value}
              minValue={s.minValue}
              maxValue={s.maxValue}
              onChange={controller.setValue}
              onValidationChange={controller.validate}
              value={s.value as number | undefined}
            />
            {adjustment(
              'increase',
              `Increase by ${s.step}`,
              '+',
              () => controller.adjust(1),
              s.increaseDisabled,
            )}
            {adjustment('max', 'Maximum', '≫', controller.max, s.maxDisabled)}
            {adjustment(
              'reset',
              'Reset to initial value',
              '↺',
              controller.reset,
              s.resetDisabled,
            )}
          </div>
        )}
        {text && s.preview !== null && (
          <p className="ValuePrompt__hint" data-testid="preview">
            {s.preview}
          </p>
        )}
        <footer
          className={`ValuePrompt__footer${large ? ' ValuePrompt__footer--large' : ''}`}
          data-large-buttons={String(large)}
          data-swapped-buttons={String(swapped)}
          style={{ flexDirection: swapped ? 'row-reverse' : 'row' }}
        >
          <button
            type="button"
            className="TithewoodControl"
            data-testid="confirm"
            aria-disabled={s.submitDisabled}
            tabIndex={s.submitDisabled ? -1 : 0}
            title={text && large ? s.count : undefined}
            onKeyDown={(event) =>
              controlKey(event, controller.submit, s.submitDisabled)
            }
            onClick={() => {
              if (!s.submitDisabled) controller.submit();
            }}
          >
            Confirm
          </button>
          {text && !large && (
            <p className="ValuePrompt__hint" data-testid="count">
              {s.count}
            </p>
          )}
          <button
            type="button"
            className="TithewoodControl"
            data-testid="cancel"
            onKeyDown={(event) => controlKey(event, controller.cancel)}
            onClick={controller.cancel}
          >
            Cancel
          </button>
        </footer>
      </div>
    </section>
  );
}
