import type { BooleanLike } from 'tgui-core/react';

export type MaterialRow = {
  path: string;
  name: string;
  price: number;
  cap: number;
  held: number;
  items: number;
  left: number;
  advertise: BooleanLike;
  enabled: BooleanLike;
};

export type ScrapperData = {
  budget: number;
  is_keyholder: BooleanLike;
  materials: MaterialRow[];
  total_items: number;
};

export type ScrapperAct = (
  action: string,
  params?: Record<string, unknown>,
) => void;
