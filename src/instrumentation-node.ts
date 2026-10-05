import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./db";

/** Applique les migrations en attente pour que la base soit toujours à jour avec le code. */
export async function prepareDatabase() {
  try {
    const url = process.env.DATABASE_URL ?? "file:./unboxipe.db";
    if (url.startsWith("file:")) {
      // WAL : les lectures ne sont plus bloquées pendant qu'un script écrit dans la base
      await db.run("PRAGMA journal_mode = WAL");
    }
    await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  } catch (e) {
    console.error("[cartes-sur-table] Échec de la mise à jour de la base :", e);
  }
}
