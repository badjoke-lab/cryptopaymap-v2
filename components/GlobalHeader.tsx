"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type GlobalHeaderProps = {
  className?: string;
};

export default function GlobalHeader({ className }: GlobalHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const logoTapCountRef = useRef(0);
  const logoTapTimeoutRef = useRef<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showPreviewDebugButton, setShowPreviewDebugButton] = useState(false);
  const [debugToast, setDebugToast] = useState<string | null>(null);
  const debugToastTimeoutRef = useRef<number | null>(null);

  const toggleDebugHud = () => {
    if (typeof window === "undefined") return;
    const key = "cpm_debug";
    const nextValue = window.localStorage.getItem(key) === "1" ? "0" : "1";
    window.localStorage.setItem(key, nextValue);
    window.dispatchEvent(new CustomEvent("cpm-debug-changed", { detail: nextValue }));
    if (debugToastTimeoutRef.current !== null) {
      window.clearTimeout(debugToastTimeoutRef.current);
    }
    setDebugToast(nextValue === "1" ? "Debug: ON" : "Debug: OFF");
    debugToastTimeoutRef.current = window.setTimeout(() => {
      setDebugToast(null);
      debugToastTimeoutRef.current = null;
    }, 1400);
  };

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowPreviewDebugButton(window.location.hostname.includes(".vercel.app"));
  }, []);

  useEffect(
    () => () => {
      if (logoTapTimeoutRef.current !== null) {
        window.clearTimeout(logoTapTimeoutRef.current);
      }
      if (debugToastTimeoutRef.current !== null) {
        window.clearTimeout(debugToastTimeoutRef.current);
      }
    },
    [],
  );

  const handleLogoTap = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    logoTapCountRef.current += 1;

    if (logoTapTimeoutRef.current !== null) {
      window.clearTimeout(logoTapTimeoutRef.current);
    }

    logoTapTimeoutRef.current = window.setTimeout(() => {
      logoTapCountRef.current = 0;
      logoTapTimeoutRef.current = null;
    }, 1200);

    if (logoTapCountRef.current >= 7) {
      logoTapCountRef.current = 0;
      if (logoTapTimeoutRef.current !== null) {
        window.clearTimeout(logoTapTimeoutRef.current);
        logoTapTimeoutRef.current = null;
      }
      toggleDebugHud();
    }
  };

  return (
    <header
      ref={headerRef}
      className={[
        "sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur",
        className ?? "",
      ].join(" ")}
    >
      {debugToast ? (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[90] -translate-x-1/2 rounded-md bg-gray-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow">
          {debugToast}
        </div>
      ) : null}
      {showPreviewDebugButton ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-[60] rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          aria-label="Toggle debug HUD"
          onClick={toggleDebugHud}
        >
          🐞
        </button>
      ) : null}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2" onClick={handleLogoTap}>
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
