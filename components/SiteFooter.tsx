import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-gray-600 sm:px-6">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 max-[480px]:flex-nowrap max-[480px]:gap-x-3 max-[480px]:whitespace-nowrap">
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

        <div className="flex items-start justify-between gap-4 text-xs text-gray-500 max-[480px]:hidden">
          <span className="whitespace-nowrap">© 2026 CryptoPayMap</span>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 whitespace-nowrap sm:gap-3">
              <a href="https://x.com/CryptoPayMap" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">
                X
              </a>
              <span aria-hidden="true">|</span>
              <a href="https://www.producthunt.com/products/cryptopaymap" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">
                Product Hunt
              </a>
              <span aria-hidden="true">|</span>
              <a href="https://bitcointalk.org/index.php?topic=5560203.0" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">
                Bitcointalk
              </a>
            </div>
            <a href="https://badjoke-lab.com" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap hover:text-gray-700">
              Built by BadJoke-Lab
            </a>
          </div>
        </div>

        <div className="hidden flex-col items-center gap-2 text-xs text-gray-500 max-[480px]:flex">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <a href="https://x.com/CryptoPayMap" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">
              X
            </a>
            <span aria-hidden="true">|</span>
            <a
              href="https://www.producthunt.com/products/cryptopaymap"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Product Hunt"
              title="Product Hunt"
              className="hover:text-gray-700"
            >
              <span className="max-[400px]:hidden">Product Hunt</span>
              <span className="hidden max-[400px]:inline">PH</span>
            </a>
            <span aria-hidden="true">|</span>
            <a
              href="https://bitcointalk.org/index.php?topic=5560203.0"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Bitcointalk"
              title="Bitcointalk"
              className="hover:text-gray-700"
            >
              <span className="max-[400px]:hidden">Bitcointalk</span>
              <span className="hidden max-[400px]:inline">BCT</span>
            </a>
          </div>
          <a href="https://badjoke-lab.com" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap hover:text-gray-700">
            Built by BadJoke-Lab
          </a>
          <span className="whitespace-nowrap">© 2026 CryptoPayMap</span>
        </div>
      </div>
    </footer>
  );
}
