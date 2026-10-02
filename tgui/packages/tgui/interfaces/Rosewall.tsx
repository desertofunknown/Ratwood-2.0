import { Window } from '../layouts';
import { RosewallContent } from './Rosewall/RosewallContent';

export const Rosewall = () => (
  <Window width={620} height={600}>
    <Window.Content scrollable className="KeepService">
      <RosewallContent />
    </Window.Content>
  </Window>
);
