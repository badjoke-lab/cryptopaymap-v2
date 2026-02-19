import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-gray-600 sm:px-6">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/about#contact" className="hover:text-gray-900">
            Contact
          </Link>
          <Link href="/submit/report" className="hover:text-gray-900">
            Report
          </Link>
          <Link href="/about#privacy" className="hover:text-gray-900">
            Privacy
          </Link>
          <Link href="/about#disclaimer" className="hover:text-gray-900">
            Disclaimer
          </Link>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>© 2026 CryptoPayMap</span>
          <a href="https://badjoke-lab.com" target="_blank" rel="noreferrer" className="hover:text-gray-700">
            Built by BadJoke-Lab
          </a>
        </div>
      </div>
    </footer>
  );
}
