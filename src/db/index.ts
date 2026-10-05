import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof makeDb> };

function makeDb() {
  const client = createClient({
    url: process.env.DATABASE_URL ?? "file:./unboxipe.db",
    authToken: process.env.DATABASE_AUTH_TOKEN, // uniquement pour Turso
  });
  // Attendre jusqu'à 5 s si la base est momentanément verrouillée (script en cours, autre onglet…)
  if ((process.env.DATABASE_URL ?? "file:").startsWith("file:")) void client.execute("PRAGMA busy_timeout = 5000").catch(() => {});
  return drizzle(client, { schema });
}

// Une seule connexion réutilisée (évite d'en ouvrir une par rechargement à chaud)
export const db = globalForDb.__db ?? (globalForDb.__db = makeDb());
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
