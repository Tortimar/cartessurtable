// Charge le fichier .env pour les scripts (sans dépendre d'une version récente de Node).
// Doit être importé en premier, avant tout accès à la base.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), ".env");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
