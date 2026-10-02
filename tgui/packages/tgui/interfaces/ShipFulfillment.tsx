import { Window } from '../layouts';
import { ShipManifest } from './ShipFulfillment/ShipManifest';

export const ShipFulfillment = () => (
  <Window width={620} height={680}>
    <Window.Content scrollable className="KeepService">
      <ShipManifest />
    </Window.Content>
  </Window>
);
