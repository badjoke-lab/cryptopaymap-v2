"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type GlobalHeaderProps = {
  className?: string;
};

export default function GlobalHeader({ className }: GlobalHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeight = () => {
      header.style.setProperty("--cpm-header-h", `${header.offsetHeight}px`);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  return (
    <header
      ref={headerRef}
      className={[
        "sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur",
        className ?? "",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/cryptopaymap-logo.png"
              alt="CryptoPayMap logo"
              width={28}
              height={28}
            />
            <span className="text-base font-black tracking-tight text-gray-900">
              CryptoPayMap
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-4 text-sm font-semibold text-gray-700 md:flex">
          <Link href="/map" className="hover:text-gray-900">
            Map
          </Link>
          <Link href="/about" className="hover:text-gray-900">
            About
          </Link>
          <Link href="/submit" className="hover:text-gray-900">
            Submit
          </Link>
          <Link href="/stats" className="hover:text-gray-900">
            Stats
          </Link>
          <Link href="/discover" className="hover:text-gray-900">
            Discover
          </Link>
          <Link href="/donate" className="hover:text-gray-900">
            Donate
          </Link>
        </nav>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="cpm-mobile-menu"
          onClick={() => setIsMenuOpen((v) => !v)}
        >
          <span>Menu</span>
          <span aria-hidden className="text-gray-500">
            {isMenuOpen ? "×" : "≡"}
          </span>
        </button>
      </div>

      {isMenuOpen ? (
        <div
          id="cpm-mobile-menu"
          className="border-t border-gray-200 bg-white px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-3 text-sm font-semibold text-gray-800">
            <Link href="/map" onClick={() => setIsMenuOpen(false)}>
              Map
            </Link>
            <Link href="/about" onClick={() => setIsMenuOpen(false)}>
              About
            </Link>
            <Link href="/submit" onClick={() => setIsMenuOpen(false)}>
              Submit
            </Link>
            <Link href="/stats" onClick={() => setIsMenuOpen(false)}>
              Stats
            </Link>
            <Link href="/discover" onClick={() => setIsMenuOpen(false)}>
              Discover
            </Link>
            <Link href="/donate" onClick={() => setIsMenuOpen(false)}>
              Donate
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
