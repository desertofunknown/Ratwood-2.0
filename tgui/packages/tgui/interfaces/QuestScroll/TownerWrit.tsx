import { RewardClause } from './RewardClause';
import { SealLine } from './Seals';
import { writParagraph } from './shared';

export const TownerWrit = (props: {
  intro?: string;
  sealNote?: string;
  reward: number;
  deposit: number;
  levyRate: number;
  levyExempt: boolean;
  guildCutRate: number;
  rulerTitle: string;
  issuedBy?: string;
  issuedOn?: string | null;
  bearer?: string;
}) => {
  const {
    intro,
    sealNote,
    reward,
    deposit,
    levyRate,
    levyExempt,
    guildCutRate,
    rulerTitle,
    issuedBy,
    issuedOn,
    bearer,
  } = props;
  const posterName = issuedBy || 'the poster';
  return (
    <>
      <p style={writParagraph}>
        <i>Be it known, under {posterName}&apos;s own hand and seal:</i>
      </p>
      {!!intro && <p style={writParagraph}>{intro}</p>}
      {!!sealNote && <p style={writParagraph}>{sealNote}</p>}
      <p style={writParagraph}>
        For this work the bearer is paid{' '}
        <RewardClause
          reward={reward}
          deposit={deposit}
          levyRate={levyRate}
          levyExempt={levyExempt}
          guildCutRate={guildCutRate}
        />
        .
      </p>
      <SealLine
        rulerTitle={rulerTitle}
        issuedBy={issuedBy}
        issuedOn={issuedOn}
        bearer={bearer}
      />
    </>
  );
};
