import type { ReactNode } from 'react';

export const Row = (props: {
  label: string;
  value: number | string;
  color?: string;
}) => (
  <tr>
    <th scope="row">{props.label}</th>
    <td className="EconomicChronicle__number" style={{ color: props.color }}>
      {props.value}
    </td>
  </tr>
);

export const Breakdown = (props: { children: ReactNode }) => (
  <p className="EconomicChronicle__breakdown">{props.children}</p>
);

export const SectionTitle = (props: { children: ReactNode }) => (
  <h2>{props.children}</h2>
);

export const formatPct = (n: number | null) => (n === null ? 'n/a' : n + '%');
