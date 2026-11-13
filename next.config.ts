import type { NextConfig } from "next";

// Everything in this app is per-user, authenticated, and read at request time,
// so we opt out of Cache Components and let pages render dynamically.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
