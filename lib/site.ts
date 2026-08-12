// Shared site URL helper — used by the sitemap and per-page metadata (openGraph).
// Override the deployed origin via NEXT_PUBLIC_URL; otherwise fall back to the
// production domain.
export function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_URL;
  if (envUrl && envUrl.startsWith("http")) {
    return envUrl.replace(/\/$/, "");
  }
  return "https://gekaixing.vercel.app";
}
