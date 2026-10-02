import { Window } from '../layouts';
import { CalendarContent } from './Calendar/CalendarContent';

export const Calendar = () => (
  <Window
    width={620}
    height={680}
    title="The Realm's Calendar"
    theme="parchment"
  >
    <Window.Content scrollable>
      <CalendarContent />
    </Window.Content>
  </Window>
);
