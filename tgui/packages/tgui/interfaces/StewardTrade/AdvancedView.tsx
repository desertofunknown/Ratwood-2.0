import { useBackend } from '../../backend';
import type { Data } from './types';

export const AdvancedView = ({ data }: { data: Data }) => {
  const { act } = useBackend<Data>();
  const alderman = !!data.is_alderman_acting;
  return (
    <section className="StewardDesk__advanced">
      <h2>Autoexport</h2>
      <p>
        Every day, stock above the export threshold is shipped away. Barred
        goods are hoarded, including deposits into full stockpiles. This can
        preserve arbitrage profit for the Crown and prevent overbuying.
        Exporting goods under shortage counts toward ending that shortage early.
      </p>
      <div className="StewardDesk__toolbar">
        <button
          type="button"
          disabled={alderman || data.shortage_goods_open <= 0}
          title={
            alderman
              ? "Reserved to the Steward's office."
              : 'Bar autoexport on every good currently under a shortage, so the sweep cannot sell off the scarcity or shorten the shortage.'
          }
          onClick={() => act('bar_autoexport_shortages')}
        >
          Bar Autoexport On Shortages ({data.shortage_goods_open})
        </button>
        <button
          type="button"
          disabled={alderman || data.autoexport_barred <= 0}
          title={
            alderman
              ? "Reserved to the Steward's office."
              : 'Clear every autoexport bar across the whole warehouse.'
          }
          onClick={() => act('allow_autoexport_all')}
        >
          Allow Autoexport On All
        </button>
        <span>{data.autoexport_barred} barred</span>
      </div>
    </section>
  );
};
