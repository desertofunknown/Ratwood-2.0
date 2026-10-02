import type { BooleanLike } from 'tgui-core/react';

export type Warrant = {
  trade_cap: number;
  trade_remaining: number;
  defense_cap: number;
  defense_remaining: number;
};

type Candidate = {
  ref: string;
  name: string;
  job: string;
  pledge: string;
  is_me: BooleanLike;
  is_alderman: BooleanLike;
};

type HistoryEntry = {
  session: number;
  day: number;
  text: string;
};

export type BracketTally = {
  tally: Record<string, number>;
  nae: number;
  total: number;
  winning_bracket: number | null;
  vetoed: BooleanLike;
};

export type YaeNayTally = {
  yae: number;
  nay: number;
  total: number;
  count: number;
  would_pass: BooleanLike;
};

type ElectionTally = {
  tally: Record<string, number>;
  total: number;
  leader_key: string | null;
};

type Tallies = {
  election?: ElectionTally;
  trade_auth?: BracketTally;
  defense_auth?: BracketTally;
  poll_tax?: BracketTally;
  recall?: YaeNayTally;
  censure?: YaeNayTally;
};

export type AssemblyData = {
  can_stand: BooleanLike;
  removal_voters: number;
  removal_weight_doubled: number;
  day: number;
  session_number: number;
  next_resolution: string;
  next_resolution_seconds: number;
  current_alderman: string | null;
  is_alderman: BooleanLike;
  is_censured: BooleanLike;
  is_outlaw: BooleanLike;
  my_weight_doubled: number;
  warrant: Warrant | null;
  my_votes: Record<string, string | undefined>;
  voter_count: number;
  quorate: BooleanLike;
  candidates: Candidate[];
  tallies: Tallies;
  history: HistoryEntry[];
  trade_brackets: number[];
  defense_brackets: number[];
  poll_brackets: number[];
  quorum_voters: number;
  recall_threshold_pct: number;
  censure_threshold_pct: number;
  nae_veto_pct: number;
};
