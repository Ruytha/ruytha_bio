/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lastfm.freetls.fastly.net" },
      { protocol: "https", hostname: "*.lastfm.freetls.fastly.net" },
    ],
  },
  // Minecraft build is a large static file served from /public — no special
  // handling needed on Vercel's free tier, static assets aren't run through
  // a serverless function so there's no 4.5MB body-size limit on it.
};

module.exports = nextConfig;
