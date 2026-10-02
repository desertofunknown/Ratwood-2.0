import { Window } from '../layouts';
import { ZadcageContent } from './Zadcage/ZadcageContent';

export const Zadcage = () => (
  <Window title="Zadcage" width={480} height={560}>
    <Window.Content scrollable className="KeepService">
      <ZadcageContent />
    </Window.Content>
  </Window>
);
