import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { ReactNode } from 'react';
import { DEFAULT_DESCRIPTION } from '@/lib/seo/metadata';

const description = DEFAULT_DESCRIPTION;
const siteUrl = 'https://www.cryptopaymap.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CryptoPayMap',
    template: '%s | CryptoPayMap',
  },
  description,
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'CryptoPayMap',
    description,
    url: '/',
    siteName: 'CryptoPayMap',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'CryptoPayMap',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CryptoPayMap',
    description,
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-0D84H0D66W"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-0D84H0D66W');`}
        </Script>
        <Script id="cpm-ld-json" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebSite',
                name: 'CryptoPayMap',
                url: siteUrl,
              },
              {
                '@type': 'Organization',
                name: 'CryptoPayMap',
                url: siteUrl,
                logo: `${siteUrl}/brand/cryptopaymap-logo.png`,
              },
            ],
          })}
        </Script>
        {children}
      </body>
    </html>
  );
}
