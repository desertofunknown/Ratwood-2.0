import { type KeyboardEvent, useState } from 'react';
import { useBackend } from 'tgui/backend';
import { Window } from 'tgui/layouts';
import { Autofocus, Box, Button, Section, Stack } from 'tgui-core/components';
import { isEscape, KEY } from 'tgui-core/keys';
import type { BooleanLike } from 'tgui-core/react';

import { Loader } from './common/Loader';

type Data = {
  autofocus: BooleanLike;
  buttons: string[];
  large_buttons: BooleanLike;
  message: string;
  swapped_buttons: BooleanLike;
  timeout: number;
  title: string;
};

enum DIRECTION {
  Increment = 1,
  Decrement = -1,
}

export function AlertModal(props) {
  const { act, data } = useBackend<Data>();
  const { autofocus, buttons = [], message = '', timeout, title } = data;

  const [selected, setSelected] = useState(0);
  const windowWidth = 500;
  const isVerbose =
    buttons.some((button) => button.length > 18) || buttons.length > 3;
  const windowHeight = Math.min(
    640,
    190 +
      Math.ceil(message.length / 55) * 22 +
      (isVerbose ? buttons.length * 46 : 0),
  );
  /** Changes button selection, etc */
  function keyDownHandler(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case KEY.Space:
      case KEY.Enter:
        event.preventDefault();
        if (buttons[selected] !== undefined) {
          act('choose', { choice: buttons[selected] });
        }
        return;
      case KEY.Left:
        event.preventDefault();
        onKey(DIRECTION.Decrement);
        return;
      case KEY.Tab:
        event.preventDefault();
        onKey(event.shiftKey ? DIRECTION.Decrement : DIRECTION.Increment);
        return;
      case KEY.Right:
        event.preventDefault();
        onKey(DIRECTION.Increment);
        return;

      default:
        if (isEscape(event.key)) {
          act('cancel');
          return;
        }
    }
  }

  /** Manages iterating through the buttons */
  function onKey(direction: DIRECTION) {
    if (!buttons.length) {
      return;
    }
    const newIndex = (selected + direction + buttons.length) % buttons.length;
    setSelected(newIndex);
  }

  return (
    <Window height={windowHeight} title={title} width={windowWidth}>
      {!!timeout && <Loader value={timeout} />}
      <Window.Content className="InputModal" onKeyDown={keyDownHandler}>
        <Section fill>
          <Stack fill vertical>
            <Stack.Item grow className="InputModal__alertMessage">
              <Box className="InputModal__prompt">{message}</Box>
            </Stack.Item>
            <Stack.Item className="InputModal__footer">
              {!!autofocus && <Autofocus />}
              {isVerbose ? (
                <VerticalButtons selected={selected} onSelect={setSelected} />
              ) : (
                <HorizontalButtons selected={selected} onSelect={setSelected} />
              )}
            </Stack.Item>
          </Stack>
        </Section>
      </Window.Content>
    </Window>
  );
}

type ButtonDisplayProps = {
  selected: number;
  onSelect: (index: number) => void;
};

/**
 * Displays a list of buttons ordered by user prefs.
 */
function HorizontalButtons(props: ButtonDisplayProps) {
  const { act, data } = useBackend<Data>();
  const { buttons = [], large_buttons, swapped_buttons } = data;
  const { selected, onSelect } = props;

  return (
    <Stack fill justify="space-around" reverse={!swapped_buttons}>
      {buttons.map((button, index) => (
        <Stack.Item grow={large_buttons ? 1 : undefined} key={index}>
          <div onFocusCapture={() => onSelect(index)}>
            <Button
              fluid={!!large_buttons}
              minWidth={5}
              onClick={() => act('choose', { choice: button })}
              className="InputModal__choice"
              captureKeys={false}
              px={2}
              py={large_buttons ? 0.5 : 0}
              selected={selected === index}
              textAlign="center"
            >
              {button}
            </Button>
          </div>
        </Stack.Item>
      ))}
    </Stack>
  );
}

/**
 * Technically the parent handles more than 2 buttons, but you
 * should just be using a list input in that case.
 */
function VerticalButtons(props: ButtonDisplayProps) {
  const { act, data } = useBackend<Data>();
  const { buttons = [], large_buttons, swapped_buttons } = data;
  const { selected, onSelect } = props;

  return (
    <Stack
      align="center"
      fill
      justify="space-around"
      reverse={!swapped_buttons}
      vertical
    >
      {buttons.map((button, index) => (
        <Stack.Item
          grow
          width="100%"
          key={index}
          m={0}
        >
          <div onFocusCapture={() => onSelect(index)}>
            <Button
              fluid
              minWidth={0}
              onClick={() => act('choose', { choice: button })}
              className="InputModal__choice"
              captureKeys={false}
              px={2}
              py={large_buttons ? 0.5 : 0}
              selected={selected === index}
              textAlign="center"
            >
              {button}
            </Button>
          </div>
        </Stack.Item>
      ))}
    </Stack>
  );
}
