import { useBackend } from '../../backend';
import type { ScrapperData } from './types';
import { WholeNumberEditor } from './WholeNumberEditor';

export const ScrapperContent = () => {
  const { act, data } = useBackend<ScrapperData>();
  const isKeyholder = !!data.is_keyholder;
  return (
    <div className="Scrapper">
      <p className="Scrapper__intro">
        Bring rag and broken stock. The scrapper weighs, pays, and melts down.
        The proprietor sets the rate.
      </p>
      <div className="Scrapper__coffer">
        <span>
          Coffer <strong>{data.budget}m</strong>
        </span>
        {isKeyholder && (
          <>
            <button
              type="button"
              disabled={data.budget <= 0}
              onClick={() => act('withdraw')}
            >
              Withdraw
            </button>
            <button
              type="button"
              disabled={
                data.total_items <= 0 &&
                !data.materials.some((row) => row.held > 0)
              }
              onClick={() => act('dump_all')}
            >
              Empty All ({data.total_items})
            </button>
          </>
        )}
      </div>
      {isKeyholder && (
        <p className="Scrapper__note">
          Drop coins into the machine to fund payouts.
        </p>
      )}
      {data.materials.length === 0 ? (
        <p className="Scrapper__empty">No materials configured.</p>
      ) : (
        <table
          className={
            isKeyholder
              ? 'Scrapper__ledger Scrapper__ledger--owner'
              : 'Scrapper__ledger'
          }
        >
          <caption>Materials Bought</caption>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Price / unit</th>
              <th scope="col">Cap (units)</th>
              <th scope="col">Held / left (units)</th>
              {isKeyholder && <th scope="col">Manage</th>}
            </tr>
          </thead>
          <tbody>
            {data.materials.map((row) => (
              <tr key={row.path} data-material={row.path}>
                <th scope="row">
                  <span className="Scrapper__name">{row.name}</span>
                  <small
                    className={
                      !row.enabled ? 'Scrapper__muted' : 'Scrapper__good'
                    }
                  >
                    {!row.enabled
                      ? 'disabled'
                      : row.advertise
                        ? 'advertised'
                        : 'enabled'}
                  </small>
                </th>
                <td>
                  {isKeyholder ? (
                    <WholeNumberEditor row={row} field="price" act={act} />
                  ) : (
                    <strong>{row.price}m</strong>
                  )}
                </td>
                <td>
                  {isKeyholder ? (
                    <WholeNumberEditor row={row} field="cap" act={act} />
                  ) : row.cap > 0 ? (
                    row.cap
                  ) : (
                    'no cap'
                  )}
                </td>
                <td className="Scrapper__stock">
                  <span>{row.held} held</span>
                  <span
                    className={
                      row.cap > 0 && row.left === 0
                        ? 'Scrapper__bad'
                        : undefined
                    }
                  >
                    {row.cap > 0 ? `${row.left} of ${row.cap} left` : 'no cap'}
                  </span>
                  <small>
                    {row.items} {row.items === 1 ? 'item' : 'items'}
                  </small>
                </td>
                {isKeyholder && (
                  <td>
                    <div className="Scrapper__actions">
                      <button
                        type="button"
                        onClick={() => act('toggle_enable', { path: row.path })}
                      >
                        {row.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          act('toggle_advertise', { path: row.path })
                        }
                      >
                        {row.advertise ? 'Quiet' : 'Advertise'}
                      </button>
                      <button
                        type="button"
                        disabled={row.items <= 0 && row.held <= 0}
                        onClick={() => act('dump_held', { path: row.path })}
                      >
                        Empty ({row.items})
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isKeyholder && data.materials.length > 0 && (
        <p className="Scrapper__note">
          Price is mammon per material unit. Cap 0 means no cap.
        </p>
      )}
    </div>
  );
};
