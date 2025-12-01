"use client";

import { forwardRef, useEffect } from "react";

import type { Place } from "../../types/places";

const VERIFICATION_COLORS: Record<Place["verification"], string> = {
  owner: "#F59E0B",
  community: "#3B82F6",
  directory: "#14B8A6",
  unverified: "#9CA3AF",
};

const VERIFICATION_LABELS: Record<Place["verification"], string> = {
  owner: "Owner verified",
  community: "Community verified",
  directory: "Directory",
  unverified: "Unverified",
};

type Props = {
  place: Place | null;
  onClose: () => void;
};

const RightDrawer = forwardRef<HTMLDivElement, Props>(({ place, onClose }, ref) => {
  const isOpen = Boolean(place);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!place) {
    return null;
  }

  const images = place.images ?? [];
  const accepted = place.accepted ?? [];

  return (
    <aside
      ref={ref}
      className={`fixed right-0 top-0 z-20 h-full w-[440px] transform border-l border-gray-200 bg-white shadow-lg transition-transform ease-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ transitionDuration: "250ms" }}
      aria-hidden={!isOpen}
    >
      <div className="flex h-full flex-col overflow-y-auto">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">{place.name}</h2>
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  color: VERIFICATION_COLORS[place.verification],
                  borderColor: VERIFICATION_COLORS[place.verification],
                  backgroundColor: `${VERIFICATION_COLORS[place.verification]}1A`,
                }}
              >
                {VERIFICATION_LABELS[place.verification]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">{place.category}</span>
              <span className="text-gray-400">•</span>
              <span>
                {place.city}, {place.country}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close drawer"
            className="text-gray-400 transition hover:text-gray-600"
            onClick={onClose}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex flex-col gap-6 px-6 py-5">
          {images.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Photos</h3>
              {images.length === 1 ? (
                <div className="overflow-hidden rounded-lg">
                  <img
                    src={images[0]}
                    alt={`${place.name} photo`}
                    className="h-[220px] w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                  {images.map((image) => (
                    <div key={image} className="snap-start overflow-hidden rounded-lg">
                      <img src={image} alt={`${place.name} photo`} className="h-40 w-64 object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {place.about && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">About</h3>
              <p className="text-sm leading-relaxed text-gray-700">{place.about}</p>
            </section>
          )}

          {accepted.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Supported crypto</h3>
              <div className="flex flex-wrap gap-2">
                {accepted.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </section>
          )}

          {(place.website || place.phone) && (
            <section className="grid grid-cols-1 gap-3 text-sm text-gray-700">
              {place.website && (
                <a
                  href={place.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                >
                  <span className="font-medium">Website</span>
                  <span className="break-all">{place.website}</span>
                </a>
              )}
              {place.phone && (
                <div className="inline-flex items-center gap-2">
                  <span className="font-medium">Phone</span>
                  <span>{place.phone}</span>
                </div>
              )}
            </section>
          )}

          {(place.twitter || place.instagram) && (
            <section className="space-y-2 text-sm text-gray-700">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Social</h3>
              <div className="flex flex-col gap-2">
                {place.twitter && (
                  <a
                    href={`https://twitter.com/${place.twitter.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {place.twitter}
                  </a>
                )}
                {place.instagram && (
                  <a
                    href={`https://instagram.com/${place.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {place.instagram}
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
});

RightDrawer.displayName = "RightDrawer";

export default RightDrawer;
