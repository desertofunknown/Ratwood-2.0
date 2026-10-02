import type { TabKey } from './types';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'orders', label: 'Standing Orders' },
  { key: 'market', label: 'Market' },
  { key: 'regions', label: 'Regions' },
  { key: 'auto_import', label: 'Imports' },
  { key: 'petition', label: 'Petition' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'royal_custom', label: 'Royal Custom' },
  { key: 'advanced', label: 'Advanced' },
];

export const TabBar = ({
  tab,
  onSwitch,
}: {
  tab: TabKey;
  onSwitch: (tab: TabKey) => void;
}) => (
  <nav className="StewardDesk__tabs" aria-label="Stewardship">
    {TABS.map(({ key, label }) => (
      <button
        key={key}
        type="button"
        aria-pressed={tab === key}
        onClick={() => onSwitch(key)}
      >
        {label}
      </button>
    ))}
  </nav>
);
