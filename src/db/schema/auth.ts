import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const jwks = pgTable("jwks", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").default(false).notNull(),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("require_pkce"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("oauth_client_userId_idx").on(table.userId)],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at").notNull(),
    revoked: timestamp("revoked"),
    authTime: timestamp("auth_time"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_refresh_token_clientId_idx").on(table.clientId),
    index("oauth_refresh_token_sessionId_idx").on(table.sessionId),
    index("oauth_refresh_token_userId_idx").on(table.userId),
  ],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    refreshId: uuid("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_sessionId_idx").on(table.sessionId),
    index("oauth_access_token_userId_idx").on(table.userId),
    index("oauth_access_token_refreshId_idx").on(table.refreshId),
  ],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ],
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
