import { useRef, useState } from 'react';
import { useBackend } from 'tgui/backend';
import { Window } from 'tgui/layouts';
import { Box, Section, Stack, TextArea } from 'tgui-core/components';
import { isEscape, KEY } from 'tgui-core/keys';
import type { BooleanLike } from 'tgui-core/react';

import { InputButtons } from './common/InputButtons';
import { Loader } from './common/Loader';

type TextInputData = {
  large_buttons: boolean;
  max_length: number;
  message: string;
  multiline: boolean;
  placeholder: string;
  timeout: number;
  title: string;
  spellcheck: BooleanLike;
  bigmodal?: boolean;
  disable_paste?: boolean; // right now just used by chastity code to force players to type out a message with ctrl+c ctrl+v, other use cases may exist. Options are nice :).
  preview_leadin?: string | null; // Optional prefix shown as a live preview ahead of the typed text.
};

export const sanitizeMultiline = (toSanitize: string) => {
  return toSanitize.replace(/(\n|\r\n){3,}/, '\n\n');
};

export const removeAllSkiplines = (toSanitize: string) => {
  return toSanitize.replace(/[\r\n]+/, '');
};

const pauseEvent = (event) => {
  if (event.stopPropagation) {
    event.stopPropagation();
  }
  if (event.preventDefault) {
    event.preventDefault();
  }
  event.cancelBubble = true;
  event.returnValue = false;
  return false;
};

export const TextInputModal = (props) => {
  const { act, data } = useBackend<TextInputData>();
  const {
    large_buttons,
    max_length,
    message = '',
    multiline,
    placeholder = '',
    timeout,
    title,
    spellcheck,
    bigmodal,
    disable_paste,
    preview_leadin,
  } = data;

  // Only initialize input from placeholder on first mount
  const initialInput = useRef(placeholder || '');
  const [input, setInput] = useState(initialInput.current);

  const onType = (value: string) => {
    if (value === input) {
      return;
    }
    const sanitizedInput = multiline
      ? sanitizeMultiline(value)
      : removeAllSkiplines(value);
    setInput(sanitizedInput);
  };

  const visualMultiline = multiline || input.length >= 30;
  // Dynamically expands the window to accommodate longer prompt messages.
  const dynamicHeight = Math.min(
    160,
    Math.max(22, Math.ceil(message.length / 55) * 22),
  );

  // Explicitly multiline inputs (flavor text, OOC notes, ERP prefs, etc.) get a large canvas
  // so they're comfortable to read and edit. visualMultiline (input overflow) gets a modest bump.
  // bigmodal hard-overrides both for the largest inputs.
  let windowHeight =
    210 +
    dynamicHeight +
    (multiline ? 225 : visualMultiline ? 80 : 0) +
    (message.length && large_buttons ? 5 : 0);
  if (preview_leadin) windowHeight += 30;
  if (bigmodal) windowHeight = 560;
  const windowWidth = bigmodal ? 620 : multiline ? 560 : 480;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isEscape(event.key)) {
      event.preventDefault();
      act('cancel');
      return;
    }
    if ((event.target as HTMLElement).closest('.InputModal__footer')) {
      return;
    }
    if (event.key === KEY.Enter && (!visualMultiline || !event.shiftKey)) {
      event.preventDefault();
      act('submit', { entry: input });
    }
  }
  // gate for chastity hardmode prayer to prevent cheaters from copy pasting
  const handleBlockedInput = (event) => {
    if (!disable_paste) {
      return;
    }
    pauseEvent(event);
  };

  return (
    <Window title={title} width={windowWidth} height={windowHeight}>
      {!!timeout && <Loader value={timeout} />}
      <Window.Content className="InputModal" onKeyDown={handleKeyDown}>
        <Section fill>
          <Stack fill vertical>
            <Stack.Item>
              <Box className="InputModal__prompt">{message}</Box>
            </Stack.Item>
            <Stack.Item grow>
              {/* height:100% propagates the Stack.Item's grown height down to the TextArea */}
              <div
                style={{ height: '100%' }}
                onDrop={handleBlockedInput}
                onPaste={handleBlockedInput}
              >
                <TextArea
                  autoFocus
                  autoSelect
                  fluid
                  userMarkup={{ u: '_', i: '|', b: '+' }}
                  height={multiline || input.length >= 30 ? '100%' : '2.8rem'}
                  maxLength={max_length}
                  onChange={onType}
                  placeholder="Type something..."
                  value={input}
                />
              </div>
            </Stack.Item>
            {!!preview_leadin && (
              <Stack.Item>
                <Box className="InputModal__hint" italic>
                  {preview_leadin} {input.trim() || '...'}
                </Box>
              </Stack.Item>
            )}
            <Stack.Item className="InputModal__footer">
              <InputButtons
                input={input}
                message={max_length > 0 && max_length <= 10000
                  ? `${input.length} / ${max_length}`
                  : `${input.length} characters`}
              />
            </Stack.Item>
          </Stack>
        </Section>
      </Window.Content>
    </Window>
  );
};
