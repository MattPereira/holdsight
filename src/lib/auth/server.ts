import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

import { db } from "@/db/index";
import * as schema from "@/db/schema";

const baseURL = process.env.BETTER_AUTH_URL;

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be configured.");
}

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [
    jwt({
      jwt: { issuer: baseURL },
      disableSettingJwtHeader: true,
    }),
    oauthProvider({
      loginPage: "/",
      consentPage: "/oauth/consent",
      validAudiences: [new URL("/api/mcp", baseURL).toString()],
      accessTokenExpiresIn: 60 * 60 * 24,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
