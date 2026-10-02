import { useBackend } from 'tgui/backend';
import { Box, Button, Stack } from 'tgui-core/components';

type InputButtonsData = {
  large_buttons: boolean;
  swapped_buttons: boolean;
};

type InputButtonsProps = {
  input: string | number | string[] | [string, number][];
} & Partial<{
  on_submit: () => void;
  on_cancel: () => void;
  message: string;
  /** Disables the submit button */
  disabled: boolean;
}>;

export const InputButtons = (props: InputButtonsProps) => {
  const { act, data } = useBackend<InputButtonsData>();
  const { large_buttons, swapped_buttons } = data;
  const { input, message, on_submit, on_cancel, disabled } = props;

  return (
    <Stack
      className="InputButtons"
      align="center"
      direction={!swapped_buttons ? 'row' : 'row-reverse'}
      fill
      justify="space-between"
    >
      <Stack.Item grow={large_buttons ? 1 : undefined}>
        <Button
          className="input-button__submit"
          disabled={disabled}
          fluid={!!large_buttons}
          icon="check"
          onClick={on_submit || (() => act('submit', { entry: input }))}
          textAlign="center"
          tooltip={large_buttons ? message : undefined}
        >
          Confirm
        </Button>
      </Stack.Item>
      {!large_buttons && message && (
        <Stack.Item>
          <Box className="InputModal__hint" textAlign="center">
            {message}
          </Box>
        </Stack.Item>
      )}
      <Stack.Item grow={large_buttons ? 1 : undefined}>
        <Button
          className="input-button__cancel"
          fluid={!!large_buttons}
          onClick={on_cancel || (() => act('cancel'))}
          textAlign="center"
        >
          Cancel
        </Button>
      </Stack.Item>
    </Stack>
  );
};
