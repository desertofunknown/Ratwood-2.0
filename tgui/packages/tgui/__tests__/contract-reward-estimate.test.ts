import { expect, test } from 'bun:test';

import { estimateContractReward } from '../interfaces/ContractLedger/rewardEstimate';

test('decimal rates use DM precision before flooring a whole-mammon deduction', () => {
  expect(
    estimateContractReward({
      reward: 100,
      deposit: 0,
      levyRate: 0.29,
      guildRate: 0.05,
      levyExempt: false,
      guildExempt: false,
    }),
  ).toEqual({ levy: 29, guild: 5, earnings: 66, deposit: 0, total: 66 });
});

test('ordinary contract separates earnings and returned deposit, including deposit in the guild fee', () => {
  expect(
    estimateContractReward({
      reward: 119,
      deposit: 20,
      levyRate: 0.15,
      guildRate: 0.05,
      levyExempt: false,
      guildExempt: false,
    }),
  ).toEqual({ levy: 17, guild: 6, earnings: 96, deposit: 20, total: 116 });
});

test('separate fractional deductions are truncated before subtracting from earnings', () => {
  expect(
    estimateContractReward({
      reward: 19,
      deposit: 0,
      levyRate: 0.15,
      guildRate: 0.05,
      levyExempt: false,
      guildExempt: false,
    }),
  ).toEqual({ levy: 2, guild: 0, earnings: 17, deposit: 0, total: 17 });
});

test('a levy-exempt contract can still owe the guild on reward plus returned deposit', () => {
  expect(
    estimateContractReward({
      reward: 119,
      deposit: 20,
      levyRate: 0.15,
      guildRate: 0.05,
      levyExempt: true,
      guildExempt: false,
    }),
  ).toEqual({ levy: 0, guild: 6, earnings: 113, deposit: 20, total: 133 });
});

test('guild-exempt commissions still use their own Crown levy status', () => {
  expect(
    estimateContractReward({
      reward: 119,
      deposit: 20,
      levyRate: 0.15,
      guildRate: 0.05,
      levyExempt: false,
      guildExempt: true,
    }),
  ).toEqual({ levy: 17, guild: 0, earnings: 102, deposit: 20, total: 122 });
});

test('fully exempt postings do not deduct current posted fees', () => {
  expect(
    estimateContractReward({
      reward: 120,
      deposit: 0,
      levyRate: 0.15,
      guildRate: 0.05,
      levyExempt: true,
      guildExempt: true,
    }),
  ).toEqual({ levy: 0, guild: 0, earnings: 120, deposit: 0, total: 120 });
});

test('zero rates preserve both the reward and the separately returned deposit', () => {
  expect(
    estimateContractReward({
      reward: 83,
      deposit: 40,
      levyRate: 0,
      guildRate: 0,
      levyExempt: false,
      guildExempt: false,
    }),
  ).toEqual({ levy: 0, guild: 0, earnings: 83, deposit: 40, total: 123 });
});
