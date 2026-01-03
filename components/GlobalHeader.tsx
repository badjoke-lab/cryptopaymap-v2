'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-semibold text-gray-900">
          <img
            src="/brand/logo.svg"
            alt="CryptoPayMap logo"
            className="h-9 w-9"
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
          <Link
            href="/"
            className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700"
          >
            Menu
          </Link>
        </div>
      </div>
    </header>
  );
}
