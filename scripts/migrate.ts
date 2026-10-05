import "./load-env";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../src/db";

// Crée ou met à jour les tables à partir des fichiers SQL du dossier drizzle/
migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") })
  .then(() => console.log("Base de données à jour."))
  .catch((e) => { console.error("Échec de la migration :", e); process.exit(1); });
