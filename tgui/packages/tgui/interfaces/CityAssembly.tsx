import { Window } from '../layouts';
import { AssemblyContent } from './CityAssembly/AssemblyContent';

export const CityAssembly = () => (
  <Window title="The City Assembly" width={780} height={740}>
    <Window.Content scrollable className="KeepService">
      <AssemblyContent />
    </Window.Content>
  </Window>
);
