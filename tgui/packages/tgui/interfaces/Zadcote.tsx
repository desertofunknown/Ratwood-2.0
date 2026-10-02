import { Window } from '../layouts';
import { ZadcoteContent } from './Zadcote/ZadcoteContent';

export const Zadcote = () => (
  <Window title="Zadcote" width={720} height={760}>
    <Window.Content scrollable className="KeepService">
      <ZadcoteContent />
    </Window.Content>
  </Window>
);
