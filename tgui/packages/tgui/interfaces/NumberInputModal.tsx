import { useState } from 'react';
import { useBackend } from 'tgui/backend';
import { Window } from 'tgui/layouts';
import {
  Box,
  Button,
  RestrictedInput,
  Section,
  Stack,
} from 'tgui-core/components';
import { isEscape, KEY } from 'tgui-core/keys';
import { clamp } from 'tgui-core/math';
import type { BooleanLike } from 'tgui-core/react';

import { InputButtons } from './common/InputButtons';
import { Loader } from './common/Loader';

type Data = {
  init_value: number;
  large_buttons: BooleanLike;
  max_value: number;
  message: string;
  min_value: number;
  round_value: BooleanLike;
  timeout: number;
  title: string;
};

export function NumberInputModal(props) {
  const { act, data } = useBackend<Data>();
  const {
    init_value,
    large_buttons,
    max_value = 10000,
    message = '',
    min_value = 0,
    round_value,
    timeout,
    title,
  } = data;

  const [value, setValue] = useState(init_value);
  const [isValid, setIsValid] = useState(true);
  const step = round_value ? 1 : 0.01;
  const adjust = (direction: number) => setValue((value) =>
    clamp(Math.round((value + direction * step) * 100) / 100, min_value, max_value),
  );

  // Dynamically changes the window height based on the message.
  const windowHeight =
    205 +
    Math.min(160, Math.ceil(message.length / 50) * 22) +
    (message.length && large_buttons ? 5 : 0);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.Button')) {
      if (isEscape(event.key)) {
        act('cancel');
      }
      return;
    }
    if (event.key === KEY.Enter && isValid) {
      event.preventDefault();
      act('submit', { entry: value });
    }
    if (isEscape(event.key)) {
      act('cancel');
    }
  }

  return (
    <Window title={title} width={480} height={windowHeight}>
      {!!timeout && <Loader value={timeout} />}
      <Window.Content className="InputModal" onKeyDown={handleKeyDown}>
        <Section fill>
          <Stack fill vertical>
            <Stack.Item grow>
              <Box className="InputModal__prompt">{message}</Box>
            </Stack.Item>
            <Stack.Item>
              <Stack fill>
                <Stack.Item>
                  <Button
                    disabled={value === min_value || min_value === -Infinity}
                    icon={
                      min_value === -Infinity ? 'infinity' : 'angle-double-left'
                    }
                    onClick={() => setValue(min_value ?? 0)}
                    tooltip={min_value ? `Min (${min_value})` : 'Min'}
                  />
                </Stack.Item>

                <Stack.Item>
                  <Button
                    icon="angle-down"
                    disabled={!isValid || value <= min_value}
                    onClick={() => adjust(-1)}
                    tooltip={`Decrease by ${step}`}
                  />
                </Stack.Item>

                <Stack.Item grow>
                  <RestrictedInput
                    autoFocus
                    autoSelect
                    fluid
                    allowFloats={!round_value}
                    minValue={min_value}
                    maxValue={max_value}
                    onChange={setValue}
                    onValidationChange={setIsValid}
                    value={value}
                  />
                </Stack.Item>

                <Stack.Item>
                  <Button
                    icon="angle-up"
                    disabled={!isValid || value >= max_value}
                    onClick={() => adjust(1)}
                    tooltip={`Increase by ${step}`}
                  />
                </Stack.Item>

                <Stack.Item>
                  <Button
                    disabled={value === max_value || max_value === Infinity}
                    icon={
                      max_value === Infinity ? 'infinity' : 'angle-double-right'
                    }
                    onClick={() => setValue(max_value ?? 10000)}
                    tooltip={max_value ? `Max (${max_value})` : 'Max'}
                  />
                </Stack.Item>
                <Stack.Item>
                  <Button
                    disabled={value === init_value}
                    icon="redo"
                    onClick={() => setValue(init_value ?? 0)}
                    tooltip={init_value ? `Reset (${init_value})` : 'Reset'}
                  />
                </Stack.Item>
              </Stack>
            </Stack.Item>
            <Stack.Item className="InputModal__footer">
              <InputButtons input={value} disabled={!isValid} />
            </Stack.Item>
          </Stack>
        </Section>
      </Window.Content>
    </Window>
  );
}
