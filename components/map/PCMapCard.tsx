"use client";

import type { Place } from "../../types/places";

import "./pc-map-card.css";

type Props = {
  place: Place | null;
  onViewDetails?: (placeId: string) => void;
};

const VERIFICATION_LABELS: Record<Place["verification"], string> = {
  owner: "Owner Verified",
  community: "Community Verified",
  directory: "Directory",
  unverified: "Unverified",
};

export function PCMapCard({ place, onViewDetails }: Props) {
  const isOpen = Boolean(place);
  const coverImage = place?.photos?.[0];

  return (
    <aside className={`pc-map-card ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
      <div className="pc-map-card__inner">
        {place && (
          <>
            <div className="pc-map-card__cover" aria-hidden={!coverImage}>
              {coverImage ? (
                <img src={coverImage} alt={`${place.name} cover`} className="pc-map-card__cover-image" />
              ) : (
                <div className="pc-map-card__cover-placeholder">No image</div>
              )}
            </div>

            <div className="pc-map-card__body">
              <div className="pc-map-card__meta-row">
                <span className="pc-map-card__category">{place.category}</span>
                <span className={`pc-map-card__badge pc-map-card__badge--${place.verification}`}>
                  {VERIFICATION_LABELS[place.verification]}
                </span>
              </div>

              <h2 className="pc-map-card__title">{place.name}</h2>
              {place.addressFull && <p className="pc-map-card__address">{place.addressFull}</p>}
              <p className="pc-map-card__location">
                {place.city}, {place.country}
              </p>

              {(place.supportedCrypto?.length ?? 0) > 0 && (
                <div className="pc-map-card__section">
                  <div className="pc-map-card__section-title">Supported crypto</div>
                  <div className="pc-map-card__chips" aria-label="Supported crypto">
                    {place.supportedCrypto.map((chain) => (
                      <span key={chain} className="pc-map-card__chip">
                        <span className="pc-map-card__chip-icon" aria-hidden />
                        <span className="pc-map-card__chip-label">{chain}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="pc-map-card__action"
                onClick={() => place && onViewDetails?.(place.id)}
              >
                View Details
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

export default PCMapCard;
