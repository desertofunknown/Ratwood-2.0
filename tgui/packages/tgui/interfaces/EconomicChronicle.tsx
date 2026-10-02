import { Window } from '../layouts';
import { EconomicChronicleContent } from './EconomicChronicle/EconomicChronicleContent';

export const EconomicChronicle = () => (
  <Window title="Realm Economics" width={920} height={660}>
    <Window.Content fitted className="KeepService EconomicChronicle">
      <EconomicChronicleContent />
    </Window.Content>
  </Window>
);
