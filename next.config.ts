import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // `forbidden()` is how a refused write answers 403 from a Server Action
  // (ADR 0005); it is gated behind this flag.
  experimental: { authInterrupts: true },
  serverExternalPackages: ["@better-auth/kysely-adapter"],
};

export default withWorkflow(nextConfig);
