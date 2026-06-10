import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle({
  client: pool,
  schema,
});

export type Db = typeof db;
