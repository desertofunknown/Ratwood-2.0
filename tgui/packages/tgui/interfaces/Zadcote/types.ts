export type ZadcoteSlot = {
  slot: number;
  name: string;
  label: string;
  bond_ref: string;
  severed: boolean;
  bonded: boolean;
  in_flight: boolean;
  cage_occupied?: boolean;
  cage_has_payload?: boolean;
  flight_zads?: number;
  flight_arrival_seconds?: number;
  flight_direction?: 'outbound' | 'return';
  flight_bombs?: number;
  allow_summons?: boolean;
};

export type MailEntry = {
  slot: number;
  sender: string;
  message: string;
  items: string[];
  stamp: string;
  kind: 'sent' | 'returned';
  lost?: number;
  zads_used?: number;
  bombs?: number;
  summoned?: boolean;
};

export type ZadcoteData = {
  faction: 'merchant' | 'steward' | 'regent' | 'bathhouse';
  can_operate: boolean;
  motto: string;
  reserve: number;
  reserve_start: number;
  flights: number;
  flight_cap: number;
  bomb_stock: number;
  bomb_stock_cap: number;
  bomb_cooldown_remaining: number;
  allows_voyeur: boolean;
  voyeur_fund: number;
  voyeur_cost: number;
  slots: ZadcoteSlot[];
  payload_in_hand: { name: string; ref: string; w_class: number }[];
  mail_log: MailEntry[];
};

export type ZadcoteAct = (
  action: string,
  payload?: Record<string, unknown>,
) => void;

export const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export const MESSAGE_MAX = 500;

export const maxWeightForTier = (tier: number): number => tier + 1;

export const weightLabel = (weight: number): string => {
  if (weight <= 1) return 'tiny';
  if (weight === 2) return 'small';
  if (weight === 3) return 'normal';
  if (weight === 4) return 'bulky';
  return 'too heavy';
};
