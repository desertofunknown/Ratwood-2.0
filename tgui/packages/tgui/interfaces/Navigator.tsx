import { Window } from '../layouts';
import { NavigatorContent } from './Navigator/NavigatorContent';

export const Navigator = () => (
  <Window title="Navigator" width={720} height={760}>
    <Window.Content scrollable className="KeepService">
      <NavigatorContent />
    </Window.Content>
  </Window>
);
