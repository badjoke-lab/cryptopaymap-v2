"use client";

import { forwardRef, useEffect, useMemo } from "react";

import type { Place } from "../../types/places";
import "./Drawer.css";

type Props = {
  place: Place | null;
  isOpen: boolean;
  mode: "full" | null;
  onClose: () => void;
  headerHeight?: number;
};

const VERIFICATION_COLORS: Record<Place["verification"], string> = {
  owner: "#F59E0B",
  community: "#3B82F6",
  directory: "#14B8A6",
  unverified: "#9CA3AF",
};

const VERIFICATION_LABELS: Record<Place["verification"], string> = {
  owner: "Owner verified",
  community: "Community verified",
  directory: "Directory listing",
  unverified: "Unverified",
};

const Drawer = forwardRef<HTMLDivElement, Props>(
  ({ place, isOpen, mode, onClose, headerHeight = 0 }, ref) => {
    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const socialLinks = useMemo(() => {
      if (!place) return [] as { label: string; href: string; key: string }[];

      const entries: { label: string; href: string; key: string }[] = [];
      if (place.twitter) {
        const handle = place.twitter.replace(/^@/, "");
        entries.push({
          key: "twitter",
          label: `@${handle}`,
          href: `https://twitter.com/${handle}`,
        });
      }
      if (place.instagram) {
        const handle = place.instagram.replace(/^@/, "");
        entries.push({
          key: "instagram",
          label: `@${handle}`,
          href: `https://instagram.com/${handle}`,
        });
      }
      if (place.facebook) {
        entries.push({
          key: "facebook",
          label: place.facebook,
          href: `https://facebook.com/${place.facebook}`,
        });
      }
      return entries;
    }, [place]);

    const acceptedChips = useMemo(() => {
      if (!place) return [] as string[];
      const ordered = ["BTC", "BTC@Lightning", "Lightning", "ETH", "USDT"];
      const sorted = [
        ...ordered.filter((item) => place.accepted.includes(item)),
        ...place.accepted
          .filter((item) => !ordered.includes(item))
          .sort((a, b) => a.localeCompare(b)),
      ];
      return Array.from(new Set(sorted));
    }, [place]);

    if (!place) {
      return (
        <div
          ref={ref}
          className={`cpm-drawer ${isOpen ? "open" : ""}`}
          style={{
            top: `var(--header-height, ${headerHeight}px)`,
            height: `calc(100vh - ${headerHeight}px)`,
          }}
          aria-hidden
        />
      );
    }

    const canShowPhotos =
      (place.verification === "owner" || place.verification === "community") &&
      (place.images?.length ?? 0) > 0;
    const canShowDescription = place.verification !== "unverified" && place.about;
    const shortAddress = [place.city, place.country].filter(Boolean).join(", ");

    return (
      <div
        ref={ref}
        className={`cpm-drawer ${isOpen && mode === "full" ? "open" : ""}`}
        style={{
          top: `var(--header-height, ${headerHeight}px)`,
          height: `calc(100vh - ${headerHeight}px)`,
        }}
        role="dialog"
        aria-label="Place details"
        aria-hidden={!isOpen}
      >
        <div className="cpm-drawer__panel">
          <header className="cpm-drawer__header">
            <div className="cpm-drawer__title-block">
              <div className="cpm-drawer__title-row">
                <h2 className="cpm-drawer__title">{place.name}</h2>
                <span
                  className="cpm-drawer__badge"
                  style={{
                    color: VERIFICATION_COLORS[place.verification],
                    borderColor: VERIFICATION_COLORS[place.verification],
                    backgroundColor: `${VERIFICATION_COLORS[place.verification]}1A`,
                  }}
                >
                  <span
                    className="cpm-drawer__badge-dot"
                    style={{ backgroundColor: VERIFICATION_COLORS[place.verification] }}
                    aria-hidden
                  />
                  {VERIFICATION_LABELS[place.verification]}
                </span>
              </div>
              <div className="cpm-drawer__meta-row">
                <span className="cpm-drawer__chip">{place.category}</span>
                <span className="cpm-drawer__dot" aria-hidden>
                  •
                </span>
                <span className="cpm-drawer__address">{shortAddress}</span>
              </div>
            </div>
            <button type="button" className="cpm-drawer__close" aria-label="Close drawer" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="cpm-drawer__content" role="presentation">
            <section className="cpm-drawer__section">
              <h3 className="cpm-drawer__section-title">Accepted</h3>
              <div className="cpm-drawer__pill-row">
                {acceptedChips.length === 0 && <span className="cpm-drawer__muted">No payment info</span>}
                {acceptedChips.map((item) => (
                  <span key={item} className="cpm-drawer__pill">
                    {item}
                  </span>
                ))}
              </div>
            </section>

            {canShowPhotos && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Photos</h3>
                <div className="cpm-drawer__carousel" aria-label="Store photos">
                  {(place.images ?? []).map((image) => (
                    <div key={image} className="cpm-drawer__carousel-item">
                      <img src={image} alt={`${place.name} photo`} className="cpm-drawer__photo" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {canShowDescription && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Description</h3>
                <p className="cpm-drawer__body">{place.about}</p>
              </section>
            )}

            {(place.website || socialLinks.length > 0 || place.phone) && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Links</h3>
                <div className="cpm-drawer__links">
                  {place.website && (
                    <a
                      className="cpm-drawer__link"
                      href={place.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website
                    </a>
                  )}
                  {place.phone && <span className="cpm-drawer__link muted">{place.phone}</span>}
                  {socialLinks.map((social) => (
                    <a
                      key={social.key}
                      className="cpm-drawer__link"
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {social.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {place.paymentNote && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Payment note</h3>
                <p className="cpm-drawer__body">{place.paymentNote}</p>
              </section>
            )}

            {(place.amenities?.length ?? 0) > 0 && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Amenities</h3>
                <div className="cpm-drawer__pill-row">
                  {(place.amenities ?? []).map((amenity) => (
                    <span key={amenity} className="cpm-drawer__pill">
                      {amenity}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          <footer className="cpm-drawer__footer">
            <div className="cpm-drawer__submitter">
              <span className="cpm-drawer__muted">Submitted by</span>
              <span className="cpm-drawer__submitter-name">
                {place.submitterName || VERIFICATION_LABELS[place.verification]}
              </span>
            </div>
            <div className="cpm-drawer__updated">
              Updated: {new Date(place.updatedAt).toLocaleDateString()}
            </div>
          </footer>
        </div>
      </div>
    );
  },
);

Drawer.displayName = "Drawer";

export default Drawer;
