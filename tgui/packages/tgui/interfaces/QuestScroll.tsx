import { useBackend } from '../backend';
import { Window } from '../layouts';
import { QuestScrollContent } from './QuestScroll/QuestScrollContent';
import type { QuestScrollData } from './QuestScroll/shared';

export const QuestScroll = () => {
  const { data } = useBackend<QuestScrollData>();
  return (
    <Window
      title="Contract Scroll"
      width={520}
      height={data.empty ? 620 : 680}
      theme="parchment"
    >
      <Window.Content scrollable>
        <QuestScrollContent />
      </Window.Content>
    </Window>
  );
};
