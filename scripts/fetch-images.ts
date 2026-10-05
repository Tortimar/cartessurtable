import "./load-env";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "../src/db";
import { findIngredientImages } from "./ingredient-images";

/**
 * Cherche une photo pour les ingrédients qui n'en ont pas encore.
 *   npm run images:fetch            → seulement les ingrédients jamais traités
 *   npm run images:fetch -- --all   → retente aussi ceux restés sans photo
 */
export async function fetchMissingImages(all = false) {
  const rows = await db
    .select({ id: schema.ingredients.id, name: schema.ingredients.name })
    .from(schema.ingredients)
    .where(all ? isNull(schema.ingredients.imageUrl) : isNull(schema.ingredients.imageCheckedAt));
  if (rows.length === 0) {
    console.log("Toutes les photos sont déjà à jour.");
    return;
  }
  console.log(`Recherche de photos pour ${rows.length} ingrédients…`);
  const found = await findIngredientImages(rows, undefined, console.log);
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const url = found.get(r.id);
      await tx
        .update(schema.ingredients)
        .set(url ? { imageUrl: url, imageCheckedAt: now } : { imageCheckedAt: now })
        .where(eq(schema.ingredients.id, r.id));
    }
  });
  console.log(`${found.size}/${rows.length} ingrédients ont maintenant une photo.`);
}

if (require.main === module) {
  fetchMissingImages(process.argv.includes("--all")).catch((e) => { console.error(e); process.exit(1); });
}
