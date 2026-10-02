import { useState } from 'react';

import { useBackend } from '../../backend';
import type { Data } from './types';

export const PetitionView = (props: { data: Data }) => {
  const { act } = useBackend<Data>();
  const {
    petition_categories,
    petition_tax_pct,
    petitions_per_day,
    petition,
    region_catalog,
  } = props.data;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    petition_categories[0]?.id ?? null,
  );
  const selectedCat = petition_categories.find(
    (category) => category.id === selectedCategory,
  );
  const cannotActReason = petition.is_alderman_acting
    ? "The Alderman's writ does not extend to petitioning the trade hall."
    : !petition.is_steward_role
      ? 'Only the Steward, Clerk, or Grand Duke may petition the trade hall.'
      : '';
  const eligibility = selectedCat
    ? petition.eligibility[selectedCat.id] || {}
    : {};

  return (
    <section className="StewardPetition">
      <h2>Petition the Trade Hall</h2>
      <p className="StewardPetition__muted">
        Send envoys to a regional trade hall to commission a Standing Order of
        your choosing. Costs Burgher Pledge. The hall takes a {petition_tax_pct}
        % margin on petitioned orders &mdash; the price of certainty. The exact
        item mix is still set by the hall.
      </p>
      <div className="StewardPetition__status">
        <span>
          Pledge balance:{' '}
          <strong className="StewardPetition__accent">
            {petition.pledge_balance}p
          </strong>
        </span>
        <span>
          Petitions remaining today:{' '}
          <strong
            className={
              petition.petitions_remaining > 0
                ? 'StewardPetition__good'
                : 'StewardPetition__bad'
            }
          >
            {petition.petitions_remaining}
          </strong>{' '}
          / {petitions_per_day}
        </span>
      </div>
      {cannotActReason && (
        <p className="StewardPetition__bad">{cannotActReason}</p>
      )}
      <div className="StewardPetition__body">
        <nav
          className="StewardPetition__categories"
          aria-label="Petition category"
        >
          <h3>Commission</h3>
          {petition_categories.length === 0 && (
            <p className="StewardPetition__muted">No categories configured.</p>
          )}
          {petition_categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={category.id === selectedCategory}
              onClick={() => setSelectedCategory(category.id)}
            >
              <span>{category.label}</span>
              <span className="StewardPetition__accent">
                {category.cost}p pledge
              </span>
            </button>
          ))}
        </nav>
        <div className="StewardPetition__destinations">
          {selectedCat ? (
            <>
              <h3>
                {selectedCat.label}{' '}
                <small className="StewardPetition__cost">
                  {selectedCat.cost}p pledge
                </small>
              </h3>
              <p className="StewardPetition__muted">
                {selectedCat.description}
              </p>
              {Object.keys(eligibility).length === 0 ? (
                <p className="StewardPetition__muted">No regions configured.</p>
              ) : (
                <table className="StewardPetition__register">
                  <thead>
                    <tr>
                      <th scope="col">Trade hall</th>
                      <th scope="col">Eligibility</th>
                      <th scope="col">Writ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(eligibility).map(([regionId, blocker]) => {
                      const regionName =
                        region_catalog[regionId]?.name ?? regionId;
                      const eligible = blocker === '';
                      const reason =
                        cannotActReason ||
                        (!eligible
                          ? blocker
                          : petition.petitions_remaining <= 0
                            ? 'no petitions remaining today'
                            : petition.pledge_balance < selectedCat.cost
                              ? `pledge short ${selectedCat.cost - petition.pledge_balance}p`
                              : '');
                      const disabled = !eligible || !!reason;
                      return (
                        <tr key={regionId}>
                          <th scope="row">{regionName}</th>
                          <td
                            className={
                              disabled
                                ? 'StewardPetition__bad'
                                : 'StewardPetition__good'
                            }
                          >
                            {blocker ||
                              reason ||
                              (eligible ? 'Eligible' : 'Unavailable')}
                          </td>
                          <td>
                            <button
                              type="button"
                              disabled={disabled}
                              title={
                                reason ||
                                `petition the ${regionName} hall for a ${selectedCat.label} order`
                              }
                              onClick={() =>
                                act('petition_for_order', {
                                  region_id: regionId,
                                  category_id: selectedCat.id,
                                })
                              }
                            >
                              Petition
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="StewardPetition__muted">Select a category at left.</p>
          )}
        </div>
      </div>
      <p className="StewardPetition__notes">
        Limit: {petitions_per_day} petition{petitions_per_day === 1 ? '' : 's'}{' '}
        per day &middot; Regions freshly cleared of blockade need a recovery
        window before envoys return &middot; Petitioned orders are visibly
        tagged on the noticeboard and in the orders panel.
      </p>
    </section>
  );
};
