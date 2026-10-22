import type { SettingsData } from './model';

// Synthetic delivered states, not defaults, user preferences, or a save result.
// Labels, descriptions, order, and palette values mirror the scoped DM payload.
// A function creates every nested object/array anew so same-reference delivery
// tests cannot contaminate another test or preview session.
export function createSampleData(): SettingsData {
  return {
    categories: [
      {
        name: 'Graphics',
        entries: [
          {
            id: 'fullscreen',
            label: 'Fullscreen',
            enabled: 0,
            desc: 'Use fullscreen mode for the game window.',
          },
          {
            id: 'crt',
            label: 'CRT Effect',
            enabled: 1,
            desc: 'Apply CRT-style blur/scanline look to the map.',
          },
          {
            id: 'grain',
            label: 'Grain Effect',
            enabled: false,
            desc: 'Overlay a subtle film grain effect.',
          },
          {
            id: 'tgui_multiline',
            label: 'TGUI Multiline',
            enabled: true,
            desc: 'Use multiline TGUI input where supported.',
          },
        ],
        selects: [
          {
            id: 'hud_colorblind_palette',
            label: 'HUD Colorblind Palette',
            value: 'none',
            desc: 'Swap the Rogue HUD and heat HUD icons to a higher-contrast colorblind palette.',
            options: [
              { label: 'Default', value: 'none' },
              { label: 'Deuteranopia', value: 'deuten' },
              { label: 'Protanopia', value: 'protan' },
              { label: 'Tritanopia', value: 'tritan' },
            ],
          },
        ],
      },
      {
        name: 'Visuals',
        entries: [
          {
            id: 'screen_shake',
            label: 'Screen Shake',
            enabled: 1,
            desc: 'Enable camera shake during impactful events.',
          },
          {
            id: 'no_redflash',
            label: 'Anti-Eyestrain Mode',
            enabled: true,
            desc: 'Disables red & white overlays flashing on screen from pain or other events.',
          },
          {
            id: 'chat_headshot',
            label: 'Headshot in Chat',
            enabled: false,
            desc: 'Show character headshot images next to chat when available.',
          },
          {
            id: 'mouseover_role',
            label: 'Show Mouseover Role',
            enabled: 0,
            desc: 'Show role text under player names on mouseover.',
          },
          {
            id: 'examine_blocks',
            label: 'Hide Examine Blocks',
            enabled: 1,
            desc: 'Hide inspect details for items inside containers.',
          },
          {
            id: 'language_fonts',
            label: 'Disable Language Fonts',
            enabled: true,
            desc: 'Use normal fonts instead of stylized language fonts.',
          },
          {
            id: 'language_icon',
            label: 'Disable Language Icon',
            enabled: 0,
            desc: 'Hide language icon prefixes in chat.',
          },
          {
            id: 'floating_text',
            label: 'Show Floating Text',
            enabled: true,
            desc: 'Show floating combat/feedback text popups.',
          },
          {
            id: 'xp_text',
            label: 'Show XP Text',
            enabled: 0,
            desc: 'Show floating XP gain popups.',
          },
        ],
      },
    ],
  };
}
