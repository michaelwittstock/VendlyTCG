import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Card thumbnails for the price checker. Scoped to these two hosts on
    // purpose — a wildcard here would let any URL we render proxy through us.
    // The API serves images from BOTH: older cards from images.pokemontcg.io,
    // newer sets from images.scrydex.com. Verified against live responses.
    remotePatterns: [
      { protocol: "https", hostname: "images.pokemontcg.io", pathname: "/**" },
      { protocol: "https", hostname: "images.scrydex.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
