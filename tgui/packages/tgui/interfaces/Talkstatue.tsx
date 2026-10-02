import { Window } from '../layouts';
import { TalkstatueContent } from './Talkstatue/TalkstatueContent';

export const Talkstatue = () => (
  <Window title="The Talking Statue" width={620} height={680}>
    <Window.Content scrollable className="KeepService">
      <TalkstatueContent />
    </Window.Content>
  </Window>
);
