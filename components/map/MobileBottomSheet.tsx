"use client";

import type React from "react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import type { Place } from "../../types/places";
import "./MobileBottomSheet.css";

type Props = {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
  selectionStatus?: "idle" | "loading" | "error";
  onStageChange?: (stage: SheetStage) => void;
};

type SheetStage = "peek" | "expanded";

const PEEK_HEIGHT = 35;
const EXPANDED_HEIGHT = 88;

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

const formatSupportedCrypto = (place: Place | null) => {
  if (!place) return [] as string[];

  const preferredOrder = ["BTC", "BTC@Lightning", "Lightning", "ETH", "USDT"];
  const chains = place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

  const sorted = [
    ...preferredOrder.filter((item) => chains.includes(item)),
    ...chains.filter((item) => !preferredOrder.includes(item)).sort((a, b) => a.localeCompare(b)),
  ];

  return Array.from(new Set(sorted));
};

const buildSocialLinks = (place: Place | null) => {
  if (!place) return [] as { label: string; href: string; key: string }[];

  const entries: { label: string; href: string; key: string }[] = [];
  const twitter = place.social_twitter ?? place.twitter;
  const instagram = place.social_instagram ?? place.instagram;
  const website = place.social_website ?? place.website;
  const facebook = place.facebook;

  if (twitter) {
    const handle = twitter.replace(/^@/, "");
    entries.push({ key: "twitter", label: `@${handle}`, href: `https://twitter.com/${handle}` });
  }
  if (instagram) {
    const handle = instagram.replace(/^@/, "");
    entries.push({ key: "instagram", label: `@${handle}`, href: `https://instagram.com/${handle}` });
  }
  if (facebook) {
    const handle = facebook.replace(/^@/, "");
    entries.push({ key: "facebook", label: handle, href: `https://facebook.com/${handle}` });
  }
  if (website) {
    entries.push({ key: "website", label: website.replace(/^https?:\/\//, ""), href: website });
  }

  return entries;
};

const buildNavigationLinks = (place: Place | null) => {
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
};

const MobileBottomSheet = forwardRef<HTMLDivElement, Props>(
  ({ place, isOpen, onClose, selectionStatus = "idle", onStageChange }, ref) => {
    const [stage, setStage] = useState<SheetStage>("peek");
    const [renderedPlace, setRenderedPlace] = useState<Place | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchCurrentY = useRef<number | null>(null);

    useEffect(() => {
      if (place) {
        setRenderedPlace(place);
        setStage("peek");
        return;
      }

      if (!isOpen) {
        const timeout = window.setTimeout(() => setRenderedPlace(null), 220);
        return () => window.clearTimeout(timeout);
      }

      return undefined;
    }, [isOpen, place]);

    const supportedCrypto = useMemo(() => formatSupportedCrypto(renderedPlace), [renderedPlace]);
    const socialLinks = useMemo(() => buildSocialLinks(renderedPlace), [renderedPlace]);
    const navigationLinks = useMemo(() => buildNavigationLinks(renderedPlace), [renderedPlace]);
    const photos = useMemo(() => {
      if (!renderedPlace) return [] as string[];
      return renderedPlace.photos?.length ? renderedPlace.photos : renderedPlace.images ?? [];
    }, [renderedPlace]);

    const isRestricted =
      renderedPlace?.verification === "directory" || renderedPlace?.verification === "unverified";

    useEffect(() => {
      if (!isOpen) return;
      onStageChange?.(stage);
    }, [isOpen, onStageChange, stage]);
    const canShowPhotos =
      renderedPlace && (renderedPlace.verification === "owner" || renderedPlace.verification === "community")
        ? photos.length > 0
        : false;
    const canShowDescription =
      renderedPlace && !isRestricted && (renderedPlace.description ?? renderedPlace.about);
    const fullAddress = renderedPlace?.address_full ?? renderedPlace?.address ?? "";
    const shortAddress = [renderedPlace?.city, renderedPlace?.country].filter(Boolean).join(", ");
    const amenities = renderedPlace?.amenities ?? [];
    const paymentNote = renderedPlace?.paymentNote;
    const submitter = renderedPlace?.submitterName ?? renderedPlace?.updatedAt;

    useEffect(() => {
      if (!isOpen || !renderedPlace) return undefined;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose, renderedPlace]);

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
      touchStartY.current = event.touches[0]?.clientY ?? null;
      touchCurrentY.current = touchStartY.current;
    };

    const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
      touchCurrentY.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchEnd = () => {
      if (touchStartY.current === null || touchCurrentY.current === null) {
        return;
      }

      const deltaY = touchCurrentY.current - touchStartY.current;
      const threshold = 40;

      if (deltaY < -threshold) {
        setStage("expanded");
      } else if (deltaY > threshold && stage === "expanded") {
        setStage("peek");
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    if (!renderedPlace && !isOpen) {
      return null;
    }

    const showPlaceholder = isOpen && !renderedPlace;
    const effectiveStage = showPlaceholder ? "expanded" : stage;
    const sheetHeight = effectiveStage === "expanded" ? `${EXPANDED_HEIGHT}vh` : `${PEEK_HEIGHT}vh`;
    const showDetails = effectiveStage === "expanded";
    const isVisible = isOpen && (Boolean(renderedPlace) || showPlaceholder);

    if (showPlaceholder) {
      const placeholderMessage =
        selectionStatus === "loading"
          ? "Loading place details..."
          : "Place details are unavailable right now.";
      return (
        <div className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`} ref={ref}>
          <div
            className="cpm-bottom-sheet__panel"
            style={{ height: sheetHeight, transform: `translateY(${isVisible ? "0" : "100%"})` }}
          >
            <div className="cpm-bottom-sheet__handle">
              <span className="cpm-bottom-sheet__handle-bar" aria-hidden />
            </div>
            <header className="cpm-bottom-sheet__header">
              <div className="cpm-bottom-sheet__title-block">
                <div className="cpm-bottom-sheet__title-row">
                  <h2 className="cpm-bottom-sheet__title">Place details</h2>
                </div>
              </div>
              <button
                type="button"
                className="cpm-bottom-sheet__close"
                onClick={onClose}
                aria-label="Close drawer"
              >
                ×
              </button>
            </header>
            <div className="cpm-bottom-sheet__content" role="presentation">
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Status</h3>
                </div>
                <p className="cpm-bottom-sheet__muted">{placeholderMessage}</p>
              </section>
            </div>
          </div>
        </div>
      );
    }

    if (!renderedPlace) {
      return null;
    }

    return (
      <div className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`} ref={ref}>
        <div
          className="cpm-bottom-sheet__panel"
          style={{ height: sheetHeight, transform: `translateY(${isVisible ? "0" : "100%"})` }}
        >
          <div
            className="cpm-bottom-sheet__handle"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => setStage((prev) => (prev === "peek" ? "expanded" : "peek"))}
          >
            <span className="cpm-bottom-sheet__handle-bar" aria-hidden />
          </div>

          <header className="cpm-bottom-sheet__header">
            <div className="cpm-bottom-sheet__title-block">
              <div className="cpm-bottom-sheet__title-row">
                <h2 className="cpm-bottom-sheet__title">{renderedPlace.name}</h2>
                <span
                  className="cpm-bottom-sheet__badge"
                  style={{
                    color: VERIFICATION_COLORS[renderedPlace.verification],
                    borderColor: VERIFICATION_COLORS[renderedPlace.verification],
                    backgroundColor: `${VERIFICATION_COLORS[renderedPlace.verification]}1A`,
                  }}
                >
                  <span
                    className="cpm-bottom-sheet__badge-dot"
                    style={{ backgroundColor: VERIFICATION_COLORS[renderedPlace.verification] }}
                    aria-hidden
                  />
                  {VERIFICATION_LABELS[renderedPlace.verification]}
                </span>
              </div>
              <div className="cpm-bottom-sheet__meta-row">
                <span className="cpm-bottom-sheet__category">{renderedPlace.category}</span>
                {shortAddress && <span className="cpm-bottom-sheet__meta-dot">•</span>}
                {shortAddress && <span className="cpm-bottom-sheet__address">{shortAddress}</span>}
              </div>
            </div>
          </header>

          <div className="cpm-bottom-sheet__content" role="presentation">
            <section className="cpm-bottom-sheet__section">
              <div className="cpm-bottom-sheet__section-head">
                <h3 className="cpm-bottom-sheet__section-title">Accepted payments</h3>
              </div>
              <div className="cpm-bottom-sheet__pill-row">
                {supportedCrypto.map((item) => (
                  <span key={item} className="cpm-bottom-sheet__pill">
                    {item}
                  </span>
                ))}
                {supportedCrypto.length === 0 && <span className="cpm-bottom-sheet__muted">Not provided</span>}
              </div>
            </section>

            {showDetails && !isRestricted && canShowPhotos && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Photos</h3>
                </div>
                <div className="cpm-bottom-sheet__carousel" aria-label={`${renderedPlace.name} photos`}>
                  {photos.map((image) => (
                    <div key={image} className="cpm-bottom-sheet__carousel-item">
                      <img src={image} alt={`${renderedPlace.name} photo`} className="cpm-bottom-sheet__photo" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {showDetails && canShowDescription && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Description</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{renderedPlace.description ?? renderedPlace.about}</p>
              </section>
            )}

            {showDetails && !isRestricted && socialLinks.length > 0 && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Links</h3>
                </div>
                <div className="cpm-bottom-sheet__links">
                  {socialLinks.map((social) => (
                    <a
                      key={social.key}
                      className="cpm-bottom-sheet__link"
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

            {showDetails && !isRestricted && navigationLinks.length > 0 && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Navigate</h3>
                </div>
                <div className="cpm-bottom-sheet__nav">
                  {navigationLinks.map((link) => (
                    <a
                      key={link.key}
                      className="cpm-bottom-sheet__nav-link"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {showDetails && !isRestricted && paymentNote && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Payment note</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{paymentNote}</p>
              </section>
            )}

            {showDetails && !isRestricted && amenities.length > 0 && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Amenities</h3>
                </div>
                <div className="cpm-bottom-sheet__pill-row">
                  {amenities.map((item) => (
                    <span key={item} className="cpm-bottom-sheet__pill muted">
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {showDetails && !isRestricted && fullAddress && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Address</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{fullAddress}</p>
              </section>
            )}

            {showDetails && !isRestricted && submitter && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Submitted by</h3>
                </div>
                <p className="cpm-bottom-sheet__body muted">{submitter}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    );
});

MobileBottomSheet.displayName = "MobileBottomSheet";

export default MobileBottomSheet;
