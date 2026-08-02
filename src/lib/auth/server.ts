import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

import { db } from "@/db/index";
import * as schema from "@/db/schema";
import { emailNotAllowedError } from "@/lib/auth/access-error";
import { isEmailAllowed, parseAllowedEmails } from "@/lib/auth/allowed-emails";

const baseURL = process.env.BETTER_AUTH_URL;
const allowedEmails = parseAllowedEmails(process.env.ALLOWED_EMAILS);

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be configured.");
}

export const auth = betterAuth({
  baseURL,
  onAPIError: {
    errorURL: new URL("/auth/error", baseURL).toString(),
  },
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
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!isEmailAllowed(user.email, allowedEmails)) {
            throw emailNotAllowedError();
          }

          return { data: user };
        },
      },
    },
    session: {
      create: {
        async before(session) {
          const [user] = await db
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .limit(1);

          if (!user || !isEmailAllowed(user.email, allowedEmails)) {
            throw emailNotAllowedError();
          }

          return { data: session };
        },
      },
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
