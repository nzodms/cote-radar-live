/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "**.shopify.com" },
    ],
  },
  // Legacy CoteRadar app is archived under /legacy and excluded from the build.
  eslint: { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
