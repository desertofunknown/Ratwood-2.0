import type { Data } from './model';

export const defaultFixture: Data = {
  title: 'A decision at the gate',
  message:
    'The steward awaits your answer. This disconnected study records choices locally only.',
  buttons: ['Enter', 'Wait', 'Leave'],
  autofocus: true,
  large_buttons: false,
  swapped_buttons: false,
};
export const fixtures: Record<string, Data> = {
  default: defaultFixture,
  exact: {
    title: 'Exact choice values',
    message:
      'Duplicates, case, whitespace, and an empty label are preserved without normalization.',
    buttons: ['Same', 'Same', 'same', '  Same  ', ''],
    autofocus: true,
  },
  verbose: {
    title: 'An extended audience',
    message: 'Each answer remains intact, even when its label needs more room.',
    buttons: [
      'Request an audience with the steward',
      'Wait beside the outer gate',
      'Return to the market square',
      'Ask the watch for directions',
    ],
    large_buttons: true,
    swapped_buttons: true,
  },
  timeout: { ...defaultFixture, title: 'Delivered timeout', timeout: 0.65 },
  emptylist: {
    title: 'No offered choices',
    message: 'There is nothing to choose. Escape still records cancellation.',
    buttons: [],
    autofocus: true,
  },
  hostile: {
    title: '<script>Literal title</script>',
    message: '<img src=x onerror=alert(1)> remains plain text. '.repeat(20),
    buttons: ['<b>Literal</b>', '& "quotes"', ''],
  },
};
export default defaultFixture;
