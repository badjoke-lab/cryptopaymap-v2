import type { Metadata } from 'next';
import StatusClient from "./StatusClient";

export const metadata: Metadata = {
  title: 'Status',
  description: 'Check service status and deployment details for CryptoPayMap.',
  alternates: {
    canonical: '/status',
  },
  openGraph: {
    title: 'CryptoPayMap Status',
    description: 'Check service status and deployment details for CryptoPayMap.',
    url: '/status',
    images: ['/og.png'],
  },
  twitter: {
    title: 'CryptoPayMap Status',
    description: 'Check service status and deployment details for CryptoPayMap.',
    images: ['/og.png'],
  },
};

const buildSha =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  null;

export default function StatusPage() {
  return <StatusClient buildSha={buildSha} />;
}
