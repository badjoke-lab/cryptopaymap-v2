'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const NAV_LINKS = [
  { label: 'Map', href: '/' },
  { label: 'Discover', href: '/discover' },
  { label: 'Stats', href: '/stats' },
  { label: 'Submit', href: '/submit' },
  { label: 'Donate', href: '/donate' },
  { label: 'Disclaimer/About', href: '/about' },
];

const isActivePath = (pathname: string, href: string) => {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/map');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};

export default function GlobalHeader() {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('cpm:debug-mode');
    setDebugMode(stored === '1');
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const setHeaderHeight = () => {
      const height = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--cpm-header-h', `${height}px`);
    };

    setHeaderHeight();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => setHeaderHeight());
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const setDebugState = (enabled: boolean) => {
    setDebugMode(enabled);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cpm:debug-mode', enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent('cpm:debug-mode-change', { detail: enabled }));
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-semibold text-gray-900">
          <Image
            src="/brand/cryptopaymap-logo.png"
            alt="CryptoPayMap"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="text-base sm:text-lg">CryptoPayMap</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-medium text-gray-600 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? 'rounded-full bg-gray-900 px-3 py-1.5 text-white'
                    : 'rounded-full px-3 py-1.5 text-gray-600 transition hover:text-gray-900'
                }
                aria-current={isActive ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700"
          >
            Menu
          </button>
        </div>
      </div>
      <div
        className={`fixed inset-0 z-[120] bg-slate-950/35 transition-opacity duration-200 md:hidden ${
          isMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isMenuOpen}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside
        className={`fixed right-0 top-0 z-[130] flex h-dvh w-[min(88vw,360px)] flex-col bg-white shadow-2xl transition-transform duration-200 md:hidden ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isMenuOpen}
        aria-label="Menu"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">Menu</div>
          <button
            type="button"
            className="rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700"
            onClick={() => setIsMenuOpen(false)}
          >
            Close
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          <Link className="rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" href="/about" onClick={() => setIsMenuOpen(false)}>
            About
          </Link>
          <Link className="rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" href="/submit" onClick={() => setIsMenuOpen(false)}>
            Submit
          </Link>
          <Link className="rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" href="/stats" onClick={() => setIsMenuOpen(false)}>
            Stats
          </Link>
          <Link className="rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50" href="/about#credits" onClick={() => setIsMenuOpen(false)}>
            Credits
          </Link>
          <div className="mt-4 rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Debug</div>
            <label className="mt-2 flex items-center justify-between gap-3 text-sm text-gray-700">
              <span>Show DB status</span>
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(event) => setDebugState(event.target.checked)}
                className="h-4 w-4"
              />
            </label>
          </div>
        </nav>
      </aside>
    </header>
  );
}
