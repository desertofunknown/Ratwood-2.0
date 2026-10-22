import { createController, type Act, type Data, type Kind } from './model';
import { assertDisconnected } from '../selection-prompt/network-guard';

export const scenarios = [
  'default',
  'fractional',
  'missing-default',
  'multiline',
  'threshold',
  'hostile-long',
  'defensive-buttons',
] as const;
export type Scenario = (typeof scenarios)[number];
export function sampleData(kind: Kind, scenario: Scenario = 'default'): Data {
  const data: Data = {
    title: kind === 'number' ? 'Choose an amount' : 'Write a message',
    message:
      'Disconnected preview. Confirm and Cancel only record local actions.',
    timeout: 0.72,
    large_buttons: false,
    swapped_buttons: false,
    ...(kind === 'number'
      ? { init_value: 5, min_value: 0, max_value: 10, round_value: true }
      : {
          placeholder: 'A quiet evening',
          max_length: 100,
          multiline: false,
          preview_leadin: 'Preview:',
        }),
  };
  if (scenario === 'fractional')
    Object.assign(data, {
      init_value: 0.99,
      min_value: 0.98,
      max_value: 1.005,
      round_value: false,
    });
  if (scenario === 'missing-default') {
    delete data.init_value;
    delete data.placeholder;
  }
  if (scenario === 'multiline')
    Object.assign(data, {
      multiline: true,
      placeholder: 'First line\n\n\nMount-only raw third newline',
      max_length: 10000,
    });
  if (scenario === 'threshold') data.placeholder = 'x'.repeat(30);
  if (scenario === 'hostile-long')
    Object.assign(data, {
      title: '<script>literal title</script>',
      message: '<img src=x onerror=alert(1)> stays literal. '.repeat(12),
      placeholder: '<b>Literal text</b> & "quotes"',
      preview_leadin: '<script>Literal preview:</script>',
    });
  if (scenario === 'defensive-buttons')
    Object.assign(data, { large_buttons: true, swapped_buttons: true });
  return data;
}
export function createSample(
  kind: Kind,
  scenario: Scenario = 'default',
  record: Act = () => {},
  close: () => void = () => {},
) {
  assertDisconnected();
  const actions: Array<{
    action: Parameters<Act>[0];
    params?: Parameters<Act>[1];
  }> = [];
  const controller = createController(
    kind,
    sampleData(kind, scenario),
    (action, params) => {
      assertDisconnected();
      actions.push({ action, params });
      record(action, params);
    },
    close,
  );
  return {
    controller,
    actions,
    deliver: controller.deliver,
    dispose: controller.close,
  };
}
