import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@better-auth/kysely-adapter"],
};

export default nextConfig;
