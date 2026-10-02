import { Window } from '../layouts';
import { TaxRollContent } from './TaxSetter/TaxRollContent';

export const TaxSetter = () => (
  <Window width={760} height={640} title="Tax Roll">
    <Window.Content scrollable className="KeepService">
      <TaxRollContent />
    </Window.Content>
  </Window>
);
