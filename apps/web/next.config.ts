import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // D20 : pages connectées rendues côté client ; pas de Cache Components.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // D12 : le navigateur appelle l'API en même origine via /api/*.
  // /auth/refresh et /auth/logout passent aussi en direct : le cookie refresh_token est posé
  // par l'API avec Path=/auth (PLAN.md §5), le navigateur ne l'envoie donc que sous /auth.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_BASE_URL}/:path*` },
      { source: "/auth/:path*", destination: `${API_BASE_URL}/auth/:path*` },
    ];
  },
};

export default nextConfig;
