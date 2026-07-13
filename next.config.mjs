const supabaseProjectId = process.env.SUPABASE_PROJECT_ID?.trim();
const publicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  (supabaseProjectId ? `https://${supabaseProjectId}.supabase.co` : undefined);
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

/** @type {Record<string, string>} */
const publicSupabaseEnv = {};
if (publicSupabaseUrl) {
  publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_URL = publicSupabaseUrl;
}
if (publicSupabaseKey) {
  publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = publicSupabaseKey;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Supabase's current CLI emits PROJECT_ID + PUBLISHABLE_KEY. Map only those
  // browser-safe values; server secrets are never copied into the client bundle.
  env: publicSupabaseEnv,
  // Playwright and the in-app browser use 127.0.0.1; Next 16 otherwise blocks
  // the development client runtime as a cross-origin resource, leaving pages
  // server-rendered but non-interactive during local verification.
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/render/image/public/**',
      },
    ],
  },
}

export default nextConfig
