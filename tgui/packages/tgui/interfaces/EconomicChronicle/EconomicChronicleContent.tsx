import { useEffect, useRef, useState } from 'react';

import { useBackend } from '../../backend';
import { BucketsSection } from './BucketsSection';
import { ContractsSection } from './ContractsSection';
import { EconomySection } from './EconomySection';
import { ShipsSection } from './ShipsSection';
import { TreasurySection } from './TreasurySection';
import type { EconomicChronicleData } from './types';

const SECTIONS = [
  'Treasury',
  'Economy',
  'Ships',
  'Navigator',
  'Contracts',
] as const;

export const EconomicChronicleContent = () => {
  const { data, act } = useBackend<EconomicChronicleData>();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Treasury');
  const bodyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [section]);
  return (
    <>
      <header className="EconomicChronicle__heading">
        <div>
          <h1>Realm Economics</h1>
          <span>
            Crown's Purse <strong>{data.treasury_balance}m</strong>
          </span>
          <button type="button" onClick={() => act('refresh')}>
            Refresh
          </button>
        </div>
        <p>
          A chronicle of mammons, ships, and crowns. Figures taken when opened
          or refreshed.
        </p>
      </header>
      <nav className="EconomicChronicle__tabs" aria-label="Economic records">
        {SECTIONS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={section === name}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <main
        ref={bodyRef}
        className="EconomicChronicle__body"
        tabIndex={0}
        aria-label={section + ' records'}
      >
        {section === 'Treasury' && <TreasurySection t={data.treasury} />}
        {section === 'Economy' && <EconomySection e={data.economy} />}
        {section === 'Ships' && <ShipsSection s={data.ships} />}
        {section === 'Navigator' && <BucketsSection b={data.buckets} />}
        {section === 'Contracts' && (
          <ContractsSection c={data.contracts} rf={data.royal_favors} />
        )}
      </main>
    </>
  );
};
