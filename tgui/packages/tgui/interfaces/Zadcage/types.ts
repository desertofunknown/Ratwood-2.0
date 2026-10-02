export type ZadcageData = {
  bonded: boolean;
  severed: boolean;
  slot_label: string;
  slot_index: number;
  cote_name: string;
  cote_motto: string;
  allow_summons: boolean;
  pending_flight: boolean;
  occupied: boolean;
  flight_ref: string;
  time_remaining?: number;
  warning_tail?: boolean;
  capacity?: number;
  has_bombs?: boolean;
  reply_message?: string;
  payload_in_hand: { name: string; ref: string; w_class?: number }[];
  stored_payload: { name: string }[];
};

export type ZadcageAct = (
  action: string,
  payload?: Record<string, unknown>,
) => void;

export const maxWeightForTier = (tier: number): number => {
  if (tier === 1) return 2;
  if (tier === 2) return 3;
  return 4;
};

export const weightLabel = (weight: number): string => {
  if (weight <= 1) return 'tiny';
  if (weight === 2) return 'small';
  if (weight === 3) return 'normal';
  if (weight === 4) return 'bulky';
  return 'too heavy';
};

export const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
