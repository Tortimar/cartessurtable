import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:./unboxipe.db";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: url.startsWith("libsql:") || url.startsWith("https:") ? "turso" : "sqlite",
  dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN },
} as Config;
