import StatusClient from "./StatusClient";

const buildSha =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  null;

export default function StatusPage() {
  return <StatusClient buildSha={buildSha} />;
}
