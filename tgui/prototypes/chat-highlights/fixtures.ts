// Synthetic, public sample content only. No game/player data or asset requests.
export type Scenario =
  | 'no-highlight'
  | 'one-group'
  | 'multi-group'
  | 'mixed'
  | 'sparse'
  | 'sparse-no-highlight';
export const scenarios: Scenario[] = [
  'no-highlight',
  'one-group',
  'multi-group',
  'mixed',
  'sparse',
  'sparse-no-highlight',
];
export function settings(scenario: Scenario) {
  const groups = [
    {
      highlightText: 'warden, bell',
      highlightColor: '#ffc857',
      highlightWholeMessage: false,
      matchWord: false,
      matchCase: false,
    },
    {
      highlightText: 'market, silver',
      highlightColor: '#8bd3dd',
      highlightWholeMessage: true,
      matchWord: true,
      matchCase: false,
    },
    {
      highlightText: '/guard(s|ian)?/',
      highlightColor: '#ee99bb',
      highlightWholeMessage: false,
      matchWord: false,
      matchCase: true,
    },
  ];
  const selected =
    scenario === 'no-highlight' || scenario === 'sparse-no-highlight'
      ? []
      : scenario === 'one-group'
        ? groups.slice(0, 1)
        : groups;
  return {
    ids: selected.map((_, i) => String(i)),
    byId: Object.fromEntries(selected.map((group, i) => [String(i), group])),
  };
}
export function messages(scenario: Scenario, count: number) {
  // no-highlight is the exact same input control for one-/multi-group.
  return Array.from({ length: count }, (_, i) => {
    const suffix = ` [fixture ${i}]`;
    const content =
      scenario.startsWith('sparse') && i % 20 !== 0
        ? 'The river runs quietly past the empty road.'
        : 'The warden rings the bell near the market. A guard counts silver.';
    if (scenario === 'mixed') {
      switch (i % 5) {
        case 0:
          return {
            html: `<span class="say"><b>Warden</b> rings <i>bell</i>; market guard silver</span>${suffix}`,
          };
        case 1:
          return { text: `Quiet river and empty road.${suffix}` };
        case 2:
          return {
            type: 'unknown',
            text: `warden bell market silver guards${suffix}`,
            avoidHighlighting: true,
          };
        case 3:
          return {
            html: `<span class="linkify">https://example.invalid/warden</span> bell${suffix}`,
          };
        default:
          return {
            html: `<span class="danger">warden bell</span> guardian${suffix}`,
          };
      }
    }
    switch (i % 3) {
      case 0:
        return { html: `<span class="say">${content}</span>${suffix}` };
      case 1:
        return { text: content + suffix };
      default:
        return {
          type: 'unknown',
          html: `<span class="notice">${content}</span>${suffix}`,
        };
    }
  });
}
