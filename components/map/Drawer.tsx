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
      const twitter = place.social_twitter ?? place.twitter;
      const instagram = place.social_instagram ?? place.instagram;
      const website = place.social_website ?? place.website;

      if (twitter) {
        const handle = twitter.replace(/^@/, "");
        entries.push({
          key: "twitter",
          label: `@${handle}`,
          href: `https://twitter.com/${handle}`,
        });
      }
      if (instagram) {
        const handle = instagram.replace(/^@/, "");
        entries.push({
          key: "instagram",
          label: `@${handle}`,
          href: `https://instagram.com/${handle}`,
        });
      }
      if (website) {
        entries.push({
          key: "website",
          label: website.replace(/^https?:\/\//, ""),
          href: website,
        });
      }
      return entries;
    }, [place]);

    const navigationLinks = useMemo(() => {
      if (!place) return [] as { label: string; href: string; key: string }[];
      const destination = `${place.lat},${place.lng}`;
      return [
        {
          key: "google-maps",
          label: "Google Maps",
          href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
        },
        {
          key: "apple-maps",
          label: "Apple Maps",
          href: `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`,
        },
      ];
    }, [place]);

    const supportedCrypto = useMemo(() => {
      if (!place) return [] as string[];
      const preferredOrder = ["BTC", "BTC@Lightning", "Lightning", "ETH", "USDT"];
      const chains = place.supported_crypto?.length
        ? place.supported_crypto
        : place.accepted ?? [];
      const sorted = [
        ...preferredOrder.filter((item) => chains.includes(item)),
        ...chains.filter((item) => !preferredOrder.includes(item)).sort((a, b) => a.localeCompare(b)),
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
          data-testid="place-drawer"
          aria-hidden
        />
      );
    }

    const photos = place.photos?.length ? place.photos : place.images ?? [];
    const isRestricted =
      place.verification === "directory" || place.verification === "unverified";
    const canShowPhotos =
      (place.verification === "owner" || place.verification === "community") && photos.length > 0;
    const canShowDescription =
      !isRestricted && Boolean(place.description ?? place.about);
    const shortAddress = [place.city, place.country].filter(Boolean).join(", ");
    const fullAddress = place.address_full ?? place.address ?? "";
    const canShowLinks = !isRestricted && socialLinks.length > 0;
    const canShowNavigation = !isRestricted && navigationLinks.length > 0;
    const canShowFullAddress = !isRestricted && Boolean(fullAddress);

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
        data-testid="place-drawer"
      >
        <div className="cpm-drawer__panel">
          <header className="cpm-drawer__header">
            <div className="cpm-drawer__title-block">
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
              <div className="cpm-drawer__meta-row">
                <span className="cpm-drawer__category">{place.category}</span>
                {shortAddress && (
                  <>
                    <span className="cpm-drawer__dot" aria-hidden>
                      •
                    </span>
                    <span className="cpm-drawer__address">{shortAddress}</span>
                  </>
                )}
              </div>
            </div>
            <button type="button" className="cpm-drawer__close" aria-label="Close drawer" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="cpm-drawer__content" role="presentation">
            <section className="cpm-drawer__section">
              <h3 className="cpm-drawer__section-title">Supported crypto</h3>
              <div className="cpm-drawer__pill-row">
                {supportedCrypto.map((item) => (
                  <span key={item} className="cpm-drawer__pill">
                    {item}
                  </span>
                ))}
                {supportedCrypto.length === 0 && <span className="cpm-drawer__muted">Not provided</span>}
              </div>
            </section>

            {canShowPhotos && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Photos</h3>
                <div className="cpm-drawer__carousel" aria-label="Store photos">
                  {photos.map((image) => (
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
                <p className="cpm-drawer__body">{place.description ?? place.about}</p>
              </section>
            )}

            {canShowLinks && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Links</h3>
                <div className="cpm-drawer__links">
                  {socialLinks.map((social) => (
                    <a
                      key={social.key}
                      className="cpm-drawer__link"
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {social.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {canShowNavigation && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Navigate</h3>
                <div className="cpm-drawer__nav">
                  {navigationLinks.map((link) => (
                    <a
                      key={link.key}
                      className="cpm-drawer__nav-link"
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {canShowFullAddress && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Address</h3>
                <p className="cpm-drawer__body">{fullAddress}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  },
);

Drawer.displayName = "Drawer";

export default Drawer;
