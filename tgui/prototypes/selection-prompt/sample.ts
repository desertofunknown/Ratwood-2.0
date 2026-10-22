import { createController, type Act, type Data } from './model';
import { assertDisconnected } from './network-guard';
export const scenarios = [
  'small',
  'search',
  'empty',
  'numeric-default',
  'missing-default',
  'hostile-long',
  'defensive-buttons',
] as const;
export type Scenario = (typeof scenarios)[number];
export function sampleData(scenario: Scenario = 'small'): Data {
  const data: Data = {
    title: 'Choose a battle hymn',
    message:
      'Select a hymn for the road ahead. Listening records a sample request only; no sound is played.',
    items: [
      'ash and iron',
      'Ash and iron',
      'ash and iron (2)',
      '  amber dusk  ',
      'brass procession',
      '1st watch',
      '2nd watch',
      'winter vigil',
    ],
    init_value: 'brass procession',
    enable_preview: true,
    previewing: false,
    timeout: 0.72,
    large_buttons: false,
    swapped_buttons: false,
  };
  if (scenario === 'search')
    data.items = [
      ...data.items,
      'candle at the gate',
      'last light',
      'oak and ember',
    ];
  if (scenario === 'empty') data.items = [];
  if (scenario === 'numeric-default') {
    data.items = ['one', '2', 'three'];
    data.init_value = 2;
  }
  if (scenario === 'missing-default') delete data.init_value;
  if (scenario === 'hostile-long') {
    data.title = '<script>literal title</script>';
    data.message =
      '<img src=x onerror=alert(1)> is literal text. ' +
      'A long unbroken message '.repeat(12);
    data.items = [
      '<script>alert("sample")</script>',
      '& < > " \'',
      '  whitespace is identity  ',
      'a'.repeat(350),
      'écho',
      'ash',
      'ash (2)',
      'ASH',
      '9th bell',
    ];
  }
  if (scenario === 'defensive-buttons') {
    data.large_buttons = true;
    data.swapped_buttons = true;
    data.message =
      'Defensive fixture only. The current DM producer hardcodes both button flags false; this is not a working preference.';
  }
  return data;
}
export function createSample(
  scenario: Scenario = 'small',
  record: Act = () => {},
  close: () => void = () => {},
) {
  assertDisconnected();
  const actions: Array<{
    action: Parameters<Act>[0];
    params?: Parameters<Act>[1];
  }> = [];
  const controller = createController(
    sampleData(scenario),
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
    deliver: (patch: Partial<Data>) => controller.deliver(patch),
    dispose: controller.close,
  };
}
