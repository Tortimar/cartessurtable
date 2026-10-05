import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { assignRarities, BASE_VALUE } from "../src/lib/game";

/**
 * Recalcule popularité et rareté de tous les ingrédients et produits à partir
 * des scans OFF stockés.
 * - Ingrédients : présent dans beaucoup de produits très scannés → commun ; confidentiel → légende.
 * - Produits : l'inverse — les 3 % les plus scannés sont Légende, les 50 % les moins scannés Communs.
 */
export async function recomputeRarities() {
  const prods = await db.select({ code: schema.products.code, popularity: schema.products.popularity }).from(schema.products);
  const links = await db.select().from(schema.productIngredients);
  const popByProduct = new Map(prods.map((p) => [p.code, p.popularity]));

  const ingPop = new Map<string, number>();
  for (const l of links) ingPop.set(l.ingredientId, (ingPop.get(l.ingredientId) ?? 0) + (popByProduct.get(l.productCode) ?? 0) + 1);

  const ingItems = [...ingPop].map(([id, popularity]) => ({ id, popularity }));
  const ingRarity = assignRarities(ingItems);
  // Produits : logique inverse — les plus scannés sont les plus prestigieux (Légende), les moins scannés sont communs
  const prodRarity = assignRarities(prods, "popular-rare");

  await db.transaction(async (tx) => {
    for (const i of ingItems) {
      const rarity = ingRarity.get(i)!;
      await tx.update(schema.ingredients).set({ popularity: i.popularity, rarity, baseValue: BASE_VALUE[rarity] }).where(eq(schema.ingredients.id, i.id));
    }
    for (const p of prods) await tx.update(schema.products).set({ rarity: prodRarity.get(p)! }).where(eq(schema.products.code, p.code));
  });

  const summary: Record<string, number> = {};
  for (const r of ingRarity.values()) summary[r] = (summary[r] ?? 0) + 1;
  return summary;
}
