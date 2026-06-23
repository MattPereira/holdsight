import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@better-auth/kysely-adapter"],
};

export default withWorkflow(nextConfig);
