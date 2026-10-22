import type { WorkbenchData } from './model';

// Illustrative contract-shaped data, not a captured player inventory or recipe list.
export function createDemoData(): WorkbenchData {
  return {
    showonlycraftable: false,
    craftability: {
      Plough: 1,
      'Wooden bucket': 1,
      Corset: 1,
      'Travel satchel': 0,
      'Linen wrap': 1,
      'Iron lantern': 0,
      'Wooden spoon': 1,
      'Pelt bedsheet': 0,
    },
    crafting_recipes: {
      Woodworking: [
        {
          name: 'Plough',
          path: '/sample/plough',
          req_text: '2 small log, 1 iron bar',
          tool_text: 'Hammer',
          craftingdifficulty: 'Apprentice',
          sellprice: 18,
        },
        {
          name: 'Wooden bucket',
          path: '/sample/bucket/log',
          req_text: '1 small log',
          tool_text: 'Knife',
          craftingdifficulty: 'Novice',
          sellprice: 6,
        },
        {
          name: 'Wooden bucket',
          path: '/sample/bucket/planks',
          req_text: '2 wooden planks',
          tool_text: 'Hammer',
          craftingdifficulty: 'Novice',
          sellprice: 6,
        },
        {
          name: 'Wooden spoon',
          path: '/sample/spoon',
          req_text: '1 stick',
          tool_text: 'Knife',
          craftingdifficulty: 'Novice',
          sellprice: 2,
        },
      ],
      Tailoring: [
        {
          name: 'Corset',
          path: '/sample/corset',
          req_text: '2 cloth, 2 fibers',
          tool_text: 'Needle',
          craftingdifficulty: 'Apprentice',
          sellprice: 12,
        },
        {
          name: 'Linen wrap',
          path: '/sample/linen',
          req_text: '2 cloth',
          craftingdifficulty: 'Novice',
          sellprice: 4,
        },
        {
          name: 'Travel satchel',
          path: '/sample/satchel',
          req_text: '3 cured hide, 2 fibers',
          tool_text: 'Needle',
          craftingdifficulty: 'Journeyman',
          sellprice: 16,
        },
        {
          name: 'Pelt bedsheet',
          path: '/sample/bedsheet',
          req_text: '2 fur, 1 fibers',
          tool_text: 'Needle',
          craftingdifficulty: 'Apprentice',
          sellprice: 10,
        },
      ],
      Smithing: [
        {
          name: 'Iron lantern',
          path: '/sample/lantern',
          req_text: '1 iron bar, 1 glass',
          tool_text: 'Hammer',
          craftingdifficulty: 'Journeyman',
          sellprice: 14,
        },
      ],
    },
  };
}
