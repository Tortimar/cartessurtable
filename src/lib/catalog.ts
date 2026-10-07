import "server-only";
import { and, asc, desc, eq, inArray, gt, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { minNextBid, RARITIES } from "./game";
import { settleAuctions } from "./services";
import { friendIds } from "./social";

const S = schema;
const PAGE_SIZE = 48;

export type CatalogQuery = {
  type: "ingredients" | "products";
  q?: string;
  rarity?: string;
  owned?: "all" | "owned" | "missing";
  sort?: "rarity" | "name" | "popularity";
  page: number;
};

const likeEscaped = (col: SQL | AnyColumn, q: string) =>
  sql`${col} like ${`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} escape '\\'`;

// Ordre de rareté utilisable en SQL (Légende d'abord)
const rarityRank = (col: AnyColumn) =>
  sql<number>`case ${col} ${sql.raw(RARITIES.map((r, i) => `when '${r}' then ${i}`).join(" "))} else 0 end`;

/** Catalogue complet : toutes les cartes du jeu, possédées ou non. */
export async function getCatalog(userId: string, query: CatalogQuery) {
  const q = query.q?.trim();
  const rarity = query.rarity && (RARITIES as readonly string[]).includes(query.rarity) ? query.rarity : undefined;
  const offset = (query.page - 1) * PAGE_SIZE;

  if (query.type === "ingredients") {
    const owned = sql<number>`coalesce(${S.userIngredients.quantity}, 0)`;
    const usedIn = sql<number>`(select count(*) from ${S.productIngredients} pi where pi.ingredient_id = ${S.ingredients.id})`;
    const where: SQL[] = [];
    if (q) where.push(likeEscaped(S.ingredients.name, q));
    if (rarity) where.push(eq(S.ingredients.rarity, rarity));
    if (query.owned === "owned") where.push(sql`${owned} > 0`);
    if (query.owned === "missing") where.push(sql`${owned} = 0`);
    const order =
      query.sort === "name" ? [asc(S.ingredients.name)]
      : query.sort === "popularity" ? [desc(S.ingredients.popularity), asc(S.ingredients.name)]
      : [desc(rarityRank(S.ingredients.rarity)), asc(S.ingredients.name)];
    const base = db
      .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, popularity: S.ingredients.popularity, baseValue: S.ingredients.baseValue, owned, usedIn })
      .from(S.ingredients)
      .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
      .where(where.length ? and(...where) : undefined);
    const rows = await base.orderBy(...order).limit(PAGE_SIZE + 1).offset(offset);
    const [{ matching }] = await db
      .select({ matching: sql<number>`count(*)` })
      .from(S.ingredients)
      .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
      .where(where.length ? and(...where) : undefined);
    const [{ total, discovered }] = await db
      .select({ total: sql<number>`count(*)`, discovered: sql<number>`sum(case when ${owned} > 0 then 1 else 0 end)` })
      .from(S.ingredients)
      .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)));
    return { type: "ingredients" as const, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, matching, total, discovered: discovered ?? 0 };
  }

  const owned = sql<number>`coalesce(${S.userProducts.quantity}, 0)`;
  const ingredientCount = sql<number>`(select count(*) from ${S.productIngredients} pi where pi.product_code = ${S.products.code})`;
  const missing = sql<number>`(
    select count(*) from ${S.productIngredients} pi
    left join ${S.userIngredients} ui on ui.ingredient_id = pi.ingredient_id and ui.user_id = ${userId}
    where pi.product_code = ${S.products.code} and coalesce(ui.quantity, 0) < 1)`;
  const where: SQL[] = [];
  if (q) where.push(sql`(${likeEscaped(S.products.name, q)} or ${likeEscaped(sql`coalesce(${S.products.brand}, '')`, q)})`);
  if (rarity) where.push(eq(S.products.rarity, rarity));
  if (query.owned === "owned") where.push(sql`${owned} > 0`);
  if (query.owned === "missing") where.push(sql`${owned} = 0`);
  const order =
    query.sort === "name" ? [asc(S.products.name)]
    : query.sort === "popularity" ? [desc(S.products.popularity), asc(S.products.name)]
    : [desc(rarityRank(S.products.rarity)), desc(S.products.popularity)];
  const rows = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl, popularity: S.products.popularity, owned, ingredientCount, missing })
    .from(S.products)
    .leftJoin(S.userProducts, and(eq(S.userProducts.productCode, S.products.code), eq(S.userProducts.userId, userId)))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  const [{ matching }] = await db
    .select({ matching: sql<number>`count(*)` })
    .from(S.products)
    .leftJoin(S.userProducts, and(eq(S.userProducts.productCode, S.products.code), eq(S.userProducts.userId, userId)))
    .where(where.length ? and(...where) : undefined);
  const [{ total, discovered }] = await db
    .select({ total: sql<number>`count(*)`, discovered: sql<number>`sum(case when ${owned} > 0 then 1 else 0 end)` })
    .from(S.products)
    .leftJoin(S.userProducts, and(eq(S.userProducts.productCode, S.products.code), eq(S.userProducts.userId, userId)));
  return { type: "products" as const, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, matching, total, discovered: discovered ?? 0 };
}

/** Fiche d'un ingrédient : où le trouver et dans quels produits il entre. */
export async function getIngredientCard(userId: string, id: string) {
  const [ing] = await db
    .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, popularity: S.ingredients.popularity, baseValue: S.ingredients.baseValue, owned: sql<number>`coalesce(${S.userIngredients.quantity}, 0)` })
    .from(S.ingredients)
    .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
    .where(eq(S.ingredients.id, id));
  if (!ing) fail("Ingrédient inconnu", 404);
  const missing = sql<number>`(
    select count(*) from ${S.productIngredients} pi2
    left join ${S.userIngredients} ui on ui.ingredient_id = pi2.ingredient_id and ui.user_id = ${userId}
    where pi2.product_code = ${S.products.code} and coalesce(ui.quantity, 0) < 1)`;
  const products = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl, missing, total: sql<number>`(select count(*) from ${S.productIngredients} pi3 where pi3.product_code = ${S.products.code})` })
    .from(S.productIngredients)
    .innerJoin(S.products, eq(S.products.code, S.productIngredients.productCode))
    .where(eq(S.productIngredients.ingredientId, id))
    .orderBy(asc(missing), desc(S.products.popularity))
    .limit(60);
  const [{ onMarket }] = await db
    .select({ onMarket: sql<number>`coalesce(sum(${S.listings.quantity}), 0)` })
    .from(S.listings)
    .where(and(eq(S.listings.ingredientId, id), eq(S.listings.status, "OPEN")));
  const [{ factories }] = await db
    .select({ factories: sql<number>`count(*)` })
    .from(S.factories)
    .where(and(eq(S.factories.ingredientId, id), eq(S.factories.userId, userId)));
  return { ingredient: ing, products, onMarket, factories };
}

/** Fiche d'un produit : recette avec les quantités possédées. */
export async function getProductCard(userId: string, code: string) {
  const [p] = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl, popularity: S.products.popularity, owned: sql<number>`coalesce(${S.userProducts.quantity}, 0)` })
    .from(S.products)
    .leftJoin(S.userProducts, and(eq(S.userProducts.productCode, S.products.code), eq(S.userProducts.userId, userId)))
    .where(eq(S.products.code, code));
  if (!p) fail("Produit inconnu", 404);
  const ingredients = await db
    .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, have: sql<number>`coalesce(${S.userIngredients.quantity}, 0)` })
    .from(S.productIngredients)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.productIngredients.ingredientId))
    .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
    .where(eq(S.productIngredients.productCode, code))
    .orderBy(desc(rarityRank(S.ingredients.rarity)), asc(S.ingredients.name));
  return { product: p, ingredients };
}

/** Où trouver un ingrédient : offres du marché en cours et amis qui possèdent la carte. */
export async function getIngredientSources(userId: string, id: string) {
  await settleAuctions();
  const [ing] = await db
    .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, baseValue: S.ingredients.baseValue, have: sql<number>`coalesce(${S.userIngredients.quantity}, 0)` })
    .from(S.ingredients)
    .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
    .where(eq(S.ingredients.id, id));
  if (!ing) fail("Ingrédient inconnu", 404);

  const listings = await db
    .select({ id: S.listings.id, quantity: S.listings.quantity, unitPrice: S.listings.unitPrice, seller: S.users.username, mine: sql<number>`${S.listings.sellerId} = ${userId}` })
    .from(S.listings)
    .innerJoin(S.users, eq(S.users.id, S.listings.sellerId))
    .where(and(eq(S.listings.ingredientId, id), eq(S.listings.status, "OPEN")))
    .orderBy(asc(S.listings.unitPrice))
    .limit(20);

  const auctions = await db
    .select({ id: S.auctions.id, quantity: S.auctions.quantity, startPrice: S.auctions.startPrice, currentBid: S.auctions.currentBid, endsAt: S.auctions.endsAt, seller: S.users.username, mine: sql<number>`${S.auctions.sellerId} = ${userId}`, leading: sql<number>`coalesce(${S.auctions.leaderId} = ${userId}, 0)` })
    .from(S.auctions)
    .innerJoin(S.users, eq(S.users.id, S.auctions.sellerId))
    .where(and(eq(S.auctions.ingredientId, id), eq(S.auctions.status, "OPEN")))
    .orderBy(asc(S.auctions.endsAt))
    .limit(20);

  const ids = [...(await friendIds(userId))];
  const friends = ids.length
    ? await db
        .select({ id: S.users.id, username: S.users.username, quantity: S.userIngredients.quantity })
        .from(S.userIngredients)
        .innerJoin(S.users, eq(S.users.id, S.userIngredients.userId))
        .where(and(eq(S.userIngredients.ingredientId, id), inArray(S.userIngredients.userId, ids), gt(S.userIngredients.quantity, 0)))
        .orderBy(desc(S.userIngredients.quantity), asc(S.users.username))
    : [];

  return {
    ingredient: ing,
    listings: listings.map((l) => ({ ...l, mine: !!l.mine })),
    auctions: auctions.map((a) => ({ ...a, mine: !!a.mine, leading: !!a.leading, minBid: minNextBid(a.startPrice, a.currentBid) })),
    friends,
    friendCount: ids.length,
  };
}
