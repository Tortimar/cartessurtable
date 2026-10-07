// Construction du catalogue (cartes + produits) à partir des produits Open Food Facts.
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../src/db";
import { CardResolver, type Card, type Resolution } from "./cards";
import { RECIPE_MAX, RECIPE_MIN, type CleanProduct } from "./import-off";

export type CatalogProduct = Omit<CleanProduct, "ingredients"> & { cards: string[] };

/**
 * Résout des ingrédients OFF en cartes. Avec `useAliases`, les correspondances déjà enregistrées
 * sont réutilisées telles quelles (les cartes restent stables d'un import à l'autre).
 */
export async function resolveIngredients(rawIds: string[], resolver: CardResolver, useAliases: boolean) {
  const ids = [...new Set(rawIds)];
  const out = new Map<string, Resolution>();
  if (useAliases && ids.length) {
    const known = [];
    for (let i = 0; i < ids.length; i += 400) known.push(...(await db.select().from(schema.ingredientAliases).where(inArray(schema.ingredientAliases.rawId, ids.slice(i, i + 400)))));
    const cardIds = [...new Set(known.map((k) => k.cardId).filter((c): c is string => !!c))];
    const cards = cardIds.length ? await db.select({ id: schema.ingredients.id, name: schema.ingredients.name, imageUrl: schema.ingredients.imageUrl }).from(schema.ingredients).where(inArray(schema.ingredients.id, cardIds)) : [];
    const byId = new Map(cards.map((c) => [c.id, c]));
    for (const k of known) {
      if (k.cardId === null) { out.set(k.rawId, { card: null, reason: k.reason }); continue; }
      const c = byId.get(k.cardId);
      if (c?.imageUrl) out.set(k.rawId, { card: { id: c.id, name: c.name, imageUrl: c.imageUrl }, reason: null });
    }
  }
  const todo = ids.filter((id) => !out.has(id));
  if (todo.length) for (const [k, v] of await resolver.resolve(todo)) out.set(k, v);
  return out;
}

/** Recettes exprimées en cartes : variantes fusionnées, ingrédients écartés retirés, 2 à 12 cartes. */
export function toCatalog(prods: CleanProduct[], res: Map<string, Resolution>) {
  const products: CatalogProduct[] = [];
  const cards = new Map<string, Card>();
  for (const p of prods) {
    const list = [...new Set(p.ingredients.map((i) => res.get(i.id)?.card?.id).filter((c): c is string => !!c))];
    if (list.length < RECIPE_MIN || list.length > RECIPE_MAX) continue;
    for (const i of p.ingredients) { const c = res.get(i.id)?.card; if (c) cards.set(c.id, c); }
    const { ingredients: _, ...rest } = p;
    products.push({ ...rest, cards: list });
  }
  return { products, cards };
}

/** Enregistre les correspondances (y compris les ingrédients écartés, pour ne pas les rechercher à chaque import). */
export function aliasRows(res: Map<string, Resolution>) {
  const now = new Date();
  return [...res].map(([rawId, r]) => ({ rawId, cardId: r.card?.id ?? null, reason: r.reason, updatedAt: now }));
}

/** Enregistre des produits déjà convertis en cartes (import réel) : cartes, produits, recettes, correspondances. */
export async function saveCatalog(products: CatalogProduct[], cards: Map<string, Card>, aliases: ReturnType<typeof aliasRows>) {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const c of cards.values())
      await tx.insert(schema.ingredients).values({ id: c.id, name: c.name, imageUrl: c.imageUrl, imageCheckedAt: now }).onConflictDoNothing();
    for (const p of products) {
      const data = { name: p.name, brand: p.brand, imageUrl: p.imageUrl, popularity: p.popularity };
      await tx.insert(schema.products).values({ code: p.code, ...data }).onConflictDoUpdate({ target: schema.products.code, set: data });
      await tx.delete(schema.productIngredients).where(eq(schema.productIngredients.productCode, p.code));
      await tx.insert(schema.productIngredients).values(p.cards.map((c) => ({ productCode: p.code, ingredientId: c })));
    }
    for (const a of aliases)
      await tx.insert(schema.ingredientAliases).values(a).onConflictDoUpdate({ target: schema.ingredientAliases.rawId, set: { cardId: a.cardId, reason: a.reason, updatedAt: a.updatedAt } });
  });
}

