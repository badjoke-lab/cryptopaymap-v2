"use client";

import { forwardRef, useEffect, useMemo } from "react";

import type { Place } from "../../types/places";
import { getPlaceViewModel } from "./placeViewModel";
import "./Drawer.css";

type Props = {
  place: Place | null;
  isOpen: boolean;
  mode: "full" | null;
  onClose: () => void;
  headerHeight?: number;
  selectionStatus?: "idle" | "loading" | "error";
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
  ({ place, isOpen, mode, onClose, headerHeight = 0, selectionStatus = "idle" }, ref) => {
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

    const viewModel = useMemo(() => getPlaceViewModel(place), [place]);

    if (!place) {
      const emptyMessage =
        selectionStatus === "loading"
          ? "Loading place details..."
          : "Place details are unavailable right now.";
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
        >
          {isOpen && (
            <div className="cpm-drawer__panel">
              <header className="cpm-drawer__header">
                <div className="cpm-drawer__title-block">
                  <h2 className="cpm-drawer__title">Place details</h2>
                </div>
                <button
                  type="button"
                  className="cpm-drawer__close"
                  aria-label="Close drawer"
                  onClick={onClose}
                >
                  ×
                </button>
              </header>
              <div className="cpm-drawer__content" role="presentation">
                <section className="cpm-drawer__section">
                  <h3 className="cpm-drawer__section-title">Status</h3>
                  <p className="cpm-drawer__muted">{emptyMessage}</p>
                </section>
              </div>
            </div>
          )}
        </div>
      );
    }

    const photos = viewModel.media;
    const isRestricted =
      place.verification === "directory" || place.verification === "unverified";
    const canShowPhotos = photos.length > 0;
    const descriptionText = place.description ?? place.about_short ?? place.about ?? null;
    const canShowDescription = !isRestricted && Boolean(descriptionText);
    const shortAddress = [place.city, place.country].filter(Boolean).join(", ");
    const fullAddress = viewModel.fullAddress;
    const canShowWebsite = Boolean(viewModel.websiteLink);
    const canShowSocial = viewModel.socialLinks.length > 0;
    const canShowPhone = Boolean(viewModel.phoneLink);
    const canShowNavigation = viewModel.navigateLinks.length > 0;
    const canShowFullAddress = Boolean(fullAddress);
    const amenities = viewModel.amenities;
    const paymentNote = viewModel.paymentNote;
    const submitter = place.submitterName ?? place.updatedAt;

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
              <h3 className="cpm-drawer__section-title">Accepted payments</h3>
              <div className="cpm-drawer__pill-row">
                {viewModel.accepted.map((item) => (
                  <span key={item} className="cpm-drawer__pill">
                    {item}
                  </span>
                ))}
                {viewModel.accepted.length === 0 && <span className="cpm-drawer__muted">Not provided</span>}
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
                <p className="cpm-drawer__body">{descriptionText}</p>
              </section>
            )}

            {canShowWebsite && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Website</h3>
                <div className="cpm-drawer__links">
                  <a
                    className="cpm-drawer__link"
                    href={viewModel.websiteLink!.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {viewModel.websiteLink!.label}
                  </a>
                </div>
              </section>
            )}

            {canShowSocial && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">SNS</h3>
                <div className="cpm-drawer__links">
                  {viewModel.socialLinks.map((social) => (
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

            {canShowPhone && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Phone</h3>
                <div className="cpm-drawer__links">
                  <a className="cpm-drawer__link" href={viewModel.phoneLink!.href}>
                    {viewModel.phoneLink!.label}
                  </a>
                </div>
              </section>
            )}

            {canShowNavigation && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Navigate</h3>
                <div className="cpm-drawer__nav">
                  {viewModel.navigateLinks.map((link) => (
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

            {paymentNote && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Payment note</h3>
                <p className="cpm-drawer__body">{paymentNote}</p>
              </section>
            )}

            {(amenities.length > 0 || Boolean(viewModel.amenitiesNotes)) && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Amenities</h3>
                <div className="cpm-drawer__pill-row">
                  {amenities.map((item) => (
                    <span key={item} className="cpm-drawer__pill">
                      {item}
                    </span>
                  ))}
                </div>
                {viewModel.amenitiesNotes && <p className="cpm-drawer__muted">{viewModel.amenitiesNotes}</p>}
              </section>
            )}

            {canShowFullAddress && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Address</h3>
                <p className="cpm-drawer__body">{fullAddress}</p>
              </section>
            )}

            {!isRestricted && submitter && (
              <section className="cpm-drawer__section">
                <h3 className="cpm-drawer__section-title">Submitted by</h3>
                <p className="cpm-drawer__muted">{submitter}</p>
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
