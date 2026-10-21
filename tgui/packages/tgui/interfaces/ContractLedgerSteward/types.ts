export type DefenseLogEntry = {
  title: string;
  type: string;
  region: string;
  cost: number;
  day: number;
};

export type BlockadeRecallEntry = {
  region: string;
  recall_eligible: number | boolean;
  recall_blocker: string | null;
  seconds_until_recallable: number;
  refund: number;
  refund_fund: string | null;
};

export type StewardData = {
  pledge_balance: number;
  pledge_refill_base: number;
  pledge_refill_per_player: number;
  pledge_active_players: number;
  pledge_available: number | boolean;
  pledge_guild_bonus: number;
  pledge_golden_active: number | boolean;
  crown_purse_balance: number;
  defense_costs: Record<string, number>;
  defense_regions_by_type: Record<string, string[]>;
  blockade_region_labels: Record<string, string>;
  region_tp_multipliers: Record<string, number>;
  defense_destinations: string[];
  defense_log: DefenseLogEntry[];
  blockade_recall_list: BlockadeRecallEntry[];
  blockade_recall_window_seconds: number;
  bonus_pay_light_mult: number;
  bonus_pay_full_mult: number;
  directives_per_day: number;
  directives_issued_today: number;
  is_alderman_acting: number | boolean;
};

export type FundingSource = 'pledge' | 'crown' | 'directive';
