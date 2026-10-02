import {
  Box,
  Button,
  Collapsible,
  Icon,
  Section,
  Stack,
} from 'tgui-core/components';
import type { BooleanLike } from 'tgui-core/react';

import { useBackend } from '../backend';
import { Window } from '../layouts';

enum VoteConfig {
  None = -1,
  Disabled = 0,
  Enabled = 1,
}

type Vote = {
  name: string;
  canBeInitiated: BooleanLike;
  config: VoteConfig;
  message: string;
};

type Option = {
  name: string;
  votes: number;
};

enum VoteSystem {
  VOTE_SINGLE = 1,
  VOTE_MULTI = 2,
}

type ActiveVote = {
  vote: Vote;
  question: string | null;
  timeRemaining: number;
  displayStatistics: BooleanLike;
  choices: Option[];
  countMethod: VoteSystem;
};

type UserData = {
  ckey: string;
  isGhost: BooleanLike;
  isLowerAdmin: BooleanLike;
  isUpperAdmin: BooleanLike;
  singleSelection: string | null;
  multiSelection: Record<string, number> | null;
};

type Data = {
  currentVote: ActiveVote | null;
  possibleVotes: Vote[];
  user: UserData;
  LastVoteTime: number;
  VoteCD: number;
};

export const VotePanel = (props) => {
  const { act, data } = useBackend<Data>();
  const { currentVote, user, LastVoteTime, VoteCD } = data;
  const cooldown = Math.max(0, Math.ceil((LastVoteTime + VoteCD) / 10));

  return (
    <Window title="The ballot" width={560} height={620}>
      <Window.Content className="VotePanel">
        <Stack vertical fill>
          <Stack.Item grow>
            <Section fill scrollable title={currentVote ? 'Active ballot' : 'Call a vote'}>
              {currentVote ? (
                <ChoicesPanel />
              ) : (
                <>
                  <Box className="VotePanel__instruction">No vote is currently open.</Box>
                  <VoteOptions />
                </>
              )}
            </Section>
          </Stack.Item>
          {!!currentVote && (
            <Stack.Item>
              <Section>
                <TimePanel />
              </Section>
            </Stack.Item>
          )}
          <Stack.Item>
            <Section className="VotePanel__administration">
              {cooldown > 0 && (
                <Box className="VotePanel__cooldown">
                  <Icon name="hourglass-half" /> Next vote available in {cooldown}s
                </Box>
              )}
              {!!currentVote && (
                <Collapsible title="Start another vote" key={currentVote.vote.name}>
                  <div className="VotePanel__newVotes"><VoteOptions /></div>
                </Collapsible>
              )}
              {!!user.isLowerAdmin && (
                <Stack wrap>
                  <Stack.Item>
                    <Button
                      icon="refresh"
                      disabled={cooldown <= 0}
                      onClick={() => act('resetCooldown')}
                    >
                      Reset cooldown
                    </Button>
                  </Stack.Item>
                  <Stack.Item>
                    <Button
                      icon="ghost"
                      disabled={!user.isUpperAdmin}
                      onClick={() => act('toggleDeadVote')}
                      tooltip="Enable or disable voting by dead players."
                    >
                      Toggle ghost voting
                    </Button>
                  </Stack.Item>
                </Stack>
              )}
              {!currentVote && cooldown === 0 && !user.isLowerAdmin && (
                <Box className="VotePanel__muted">Choose an available vote to begin.</Box>
              )}
            </Section>
          </Stack.Item>
        </Stack>
      </Window.Content>
    </Window>
  );
};

const VoteOptions = () => {
  const { act, data } = useBackend<Data>();
  const { possibleVotes, user, LastVoteTime, VoteCD } = data;
  const coolingDown = LastVoteTime + VoteCD > 0;

  return (
    <Stack vertical>
      {possibleVotes.map((option) => (
        <Stack.Item key={option.name}>
          <div className="VotePanel__proposal">
            <Button
              fluid
              disabled={!option.canBeInitiated || coolingDown}
              onClick={() => act('callVote', { voteName: option.name })}
              icon="play"
            >
              {option.name.replace(/^\w/, (c) => c.toUpperCase())} vote
            </Button>
            <Box className="VotePanel__muted">{option.message}</Box>
            {!!user.isLowerAdmin && (
              <Button.Checkbox
                checked={option.config !== VoteConfig.Disabled}
                disabled={!user.isUpperAdmin || option.config === VoteConfig.None}
                tooltip={option.config === VoteConfig.None ? 'This vote cannot be disabled.' : undefined}
                onClick={() => act('toggleVote', { voteName: option.name })}
              >
                Enabled
              </Button.Checkbox>
            )}
          </div>
        </Stack.Item>
      ))}
    </Stack>
  );
};

const ChoicesPanel = () => {
  const { act, data } = useBackend<Data>();
  const { currentVote, user } = data;
  if (!currentVote) return null;
  const single = currentVote.countMethod === VoteSystem.VOTE_SINGLE;
  const multiple = currentVote.countMethod === VoteSystem.VOTE_MULTI;

  return (
    <>
      <h2 className="VotePanel__question">{currentVote.question || currentVote.vote.name}</h2>
      <Box className="VotePanel__instruction">
        {single ? 'Choose one option.' : multiple ? 'Choose any number of options. Select again to remove a choice.' : 'Voting is unavailable.'}
      </Box>
      {!!user.isGhost && (
        <Box className="VotePanel__cooldown">Ghost voting is disabled for this ballot.</Box>
      )}
      {currentVote.choices.map((choice) => {
        const selected = single
          ? user.singleSelection === choice.name
          : user.multiSelection?.[user.ckey + choice.name] === 1;
        return (
          <Button
            key={choice.name}
            className="VotePanel__choice"
            color="transparent"
            fluid
            selected={selected}
            disabled={!!user.isGhost || (!single && !multiple) || (single && selected)}
            onClick={() => act(single ? 'voteSingle' : 'voteMulti', { voteOption: choice.name })}
          >
            <span className="VotePanel__selection"><Icon name={selected ? 'check-square' : 'square'} /></span>
            <span className="VotePanel__choiceName">{choice.name.replace(/^\w/, (c) => c.toUpperCase())}</span>
            {!!currentVote.displayStatistics && (
              <span className="VotePanel__count">{choice.votes} {choice.votes === 1 ? 'vote' : 'votes'}</span>
            )}
          </Button>
        );
      })}
      {!currentVote.choices.length && <Box className="VotePanel__muted">No choices are available.</Box>}
    </>
  );
};

const TimePanel = () => {
  const { act, data } = useBackend<Data>();
  const { currentVote, user } = data;
  if (!currentVote) return null;

  return (
    <Stack align="center" justify="space-between" wrap>
      <Stack.Item>
        <Box className="VotePanel__time"><Icon name="hourglass-half" /> {currentVote.timeRemaining}s remaining</Box>
      </Stack.Item>
      {!!user.isLowerAdmin && (
        <Stack.Item>
          <Button onClick={() => act('endNow')}>End now</Button>
          <Button onClick={() => act('cancel')}>Cancel vote</Button>
        </Stack.Item>
      )}
    </Stack>
  );
};
