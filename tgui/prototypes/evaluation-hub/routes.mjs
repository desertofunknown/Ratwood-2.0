// Source-owned editorial registry. URLs come only from approved-routes.json.
export const journeys = [
  {
    id: 'prepare', title: 'Prepare for play',
    description: 'Check readability first, then compare the small decisions that interrupt play.',
    studies: ['display-readability', 'alert-prompt', 'selection-prompt', 'value-prompts'],
  },
  {
    id: 'work-trade', title: 'Work and trade',
    description: 'Follow a recipe, inspect a quote, and read the treasury without connecting to the game.',
    studies: ['crafting-workbench', 'market-quote', 'treasury-ledger'],
  },
  {
    id: 'read-respond', title: 'Read and respond',
    description: 'Find what changed and compare how longer information is presented.',
    studies: ['changes-archive'],
  },
];
export const studies = {
  'display-readability': {
    title: 'Display & readability',
    description: 'Explore the bounded Graphics / Visuals preference study.',
    prompt: 'Look for legible labels, clear settings and a comfortable reading rhythm.',
  },
  'alert-prompt': {
    title: 'Alerts & decisions',
    description: 'Compare a short message and its available responses.',
    prompt: 'Can you distinguish the choices and find the intended response?',
  },
  'selection-prompt': {
    title: 'Choose from a list',
    description: 'Compare the selection prompt with the same sample choices.',
    prompt: 'Try keyboard navigation and check that the current choice is clear.',
  },
  'value-prompts': {
    title: 'Enter a value',
    description: 'Compare number and text entry in the value prompt studies.',
    prompt: 'Check labels, validation feedback and the difference between submitting and cancelling.',
  },
  'crafting-workbench': {
    title: 'Crafting workbench',
    description: 'Browse illustrative recipes in the paired RealWindow integration studies.',
    prompt: 'Can you find a recipe and understand what it needs without losing your place?',
  },
  'market-quote': {
    title: 'Market & shipment quotes',
    description: 'Inspect sample goods and recorded quotes. No trade can be submitted.',
    prompt: 'Check whether current, stale and rejected quote states are easy to distinguish.',
  },
  'treasury-ledger': {
    title: 'Treasury ledger',
    description: 'Read the disconnected treasury study and its sample records.',
    prompt: 'Compare the hierarchy of totals, details and longer lists.',
  },
  'changes-archive': {
    title: 'Changes archive',
    description: 'Browse recorded changes in the paired archive views.',
    prompt: 'Search for a topic, read matching entries and clear the search without losing the month.',
  },
};
export const research = {
  id: 'crafting-standalone',
  title: 'Standalone crafting comparison',
  description: 'A separate three-arm study: Svelte, React and browser-Lua. These standalone samples are research comparisons, not replacements for the integrated crafting studies or a production framework decision.',
};
