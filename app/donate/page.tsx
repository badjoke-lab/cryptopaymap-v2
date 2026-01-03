import CopyButton from '@/components/CopyButton';

const DONATION_ADDRESSES = [
  {
    label: 'BTC',
    address: 'bc1qhg2a9yp6nwdlfuzvm70dpzfun0xzrctn4cyzlt',
    network: 'Bitcoin',
  },
  {
    label: 'ETH',
    address: '0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9',
    network: 'Ethereum (ERC-20)',
  },
  {
    label: 'USDT',
    address: '0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9',
    network: 'ERC-20 / BEP-20',
  },
  {
    label: 'USDC',
    address: '0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9',
    network: 'ERC-20 / BEP-20',
  },
  {
    label: 'SOL',
    address: '7aqoEHgKniBoUbgyJLBEsGKZG2K3seTsbCwQrxAi9DMR',
    network: 'Solana',
  },
  {
    label: 'BNB',
    address: '0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9',
    network: 'BEP-20',
  },
  {
    label: 'DOGE',
    address: 'DBcD6vrY1KWZGxzohaADF2LYKkZbL1qD8q',
    network: 'Dogecoin',
  },
  {
    label: 'AVAX',
    address: '0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9',
    network: 'Avalanche C-Chain',
  },
  {
    label: 'XRP',
    address: 'rHFpSj15qmruSpptrVZxGZxDPGVjNRu95S',
    network: 'Ripple',
  },
];

const SUPPORT_LINKS = [
  {
    label: 'Donate with Stripe',
    href: 'https://buy.stripe.com/cNi8wI7oPcvS4x528zcIE00',
  },
  {
    label: 'Support on Ko-fi',
    href: 'https://ko-fi.com/badjoke_lab',
  },
];

export default function DonatePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Donate</p>
        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Support the CryptoPayMap project</h1>
        <p className="max-w-2xl text-base text-gray-600">
          Your contributions help us maintain the directory, verify submissions, and build new discovery tools for the
          crypto community.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Crypto addresses</h2>
        <p className="mt-2 text-sm text-gray-600">Tap the copy button to save any address.</p>

        <div className="mt-6 space-y-4">
          {DONATION_ADDRESSES.map((item) => (
            <div
              key={`${item.label}-${item.network}`}
              className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">{item.label}</span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    {item.network}
                  </span>
                </div>
                <p className="mt-2 break-all font-mono text-sm text-gray-700">{item.address}</p>
              </div>
              <CopyButton text={item.address} ariaLabel={`Copy ${item.label} address`} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Card &amp; hosted donations</h2>
        <p className="mt-2 text-sm text-gray-600">Prefer a traditional checkout? Use one of the hosted options.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {SUPPORT_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
