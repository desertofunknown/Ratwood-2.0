import { Window } from '../layouts';

import { DecreeRegister } from './DecreeSetter/DecreeRegister';

export const DecreeSetter = () => (
  <Window width={620} height={720} title="Charters of the Realm">
    <Window.Content scrollable className="KeepService">
      <DecreeRegister />
    </Window.Content>
  </Window>
);
