import type { BooleanLike } from 'tgui-core/react';

export type Role = {
  ref: string;
  name: string;
  amount: number;
  kind: 'required' | 'optional';
  stars: number;
  queued: BooleanLike;
  can_be: BooleanLike;
  desc: string;
};

export type WaveInfo = {
  ref: string;
  name: string;
  track: string;
  weight: number;
  roll_chance: number;
  triumph_total: number;
  triumph_threshold: number;
  my_contribution: number;
  maxed: BooleanLike;
  locked_until: number;
  queued: BooleanLike;
  min_optional_fills: number;
  roles: Role[];
};

export type FormingWave = {
  track: string;
  ref: string;
  name: string;
  arrival_at: number;
  queued: BooleanLike;
  min_optional_fills: number;
  roles: Role[];
};

export type MigrantData = {
  server_time: number;
  wave_number: number;
  player_triumph: number;
  active_migrants: number;
  round_time: number;
  queued_wave: string | null;
  queued_role: string | null;
  forming: FormingWave[];
  next_regular_at: number;
  next_special_at: number;
  waves: WaveInfo[];
};

export type MigrantAct = (
  action: string,
  params?: Record<string, unknown>,
) => void;

export const fmtClock = (deciseconds: number): string => {
  const seconds = Math.max(0, Math.round(deciseconds / 10));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
