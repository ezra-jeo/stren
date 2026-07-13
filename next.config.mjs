/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
