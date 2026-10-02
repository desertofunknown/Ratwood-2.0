import { Window } from '../layouts';
import { MigrantPanelContent } from './MigrantPanel/MigrantPanelContent';

export const MigrantPanel = () => (
  <Window title="Find a Purpose" width={760} height={680}>
    <Window.Content scrollable className="KeepService">
      <MigrantPanelContent />
    </Window.Content>
  </Window>
);
