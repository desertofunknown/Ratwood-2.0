export type ContractRewardTerms = {
  reward: number;
  deposit: number;
  levyRate: number;
  guildRate: number;
  levyExempt: boolean;
  guildExempt: boolean;
};

// DM stores amounts and arithmetic results as single-precision numbers.
const wholeDeduction = (amount: number, rate: number) =>
  Math.floor(Math.fround(Math.fround(amount) * Math.fround(rate)));

// Posted-rate estimate. Settlement also uses the beneficiary's charter and tax debt.
export const estimateContractReward = (terms: ContractRewardTerms) => {
  const { reward, deposit, levyRate, guildRate, levyExempt, guildExempt } =
    terms;
  const levy =
    !levyExempt && levyRate > 0 ? wholeDeduction(reward, levyRate) : 0;
  const guild =
    !guildExempt && guildRate > 0
      ? wholeDeduction(reward + deposit, guildRate)
      : 0;
  const earnings = reward - levy - guild;
  return { levy, guild, earnings, deposit, total: earnings + deposit };
};
