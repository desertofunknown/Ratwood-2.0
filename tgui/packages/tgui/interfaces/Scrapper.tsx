import { useBackend } from '../backend';
import { Window } from '../layouts';
import { ScrapperContent } from './Scrapper/ScrapperContent';
import type { ScrapperData } from './Scrapper/types';

export const Scrapper = () => {
  const { data } = useBackend<ScrapperData>();
  return (
    <Window
      title="The Scrapper"
      width={data.is_keyholder ? 780 : 500}
      height={530}
    >
      <Window.Content scrollable className="KeepService">
        <ScrapperContent />
      </Window.Content>
    </Window>
  );
};
