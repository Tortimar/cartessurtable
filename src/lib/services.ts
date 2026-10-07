import "server-only";
import { and, asc, desc, eq, gt, inArray, like, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, schema, type Tx } from "@/db";
import { fail } from "./api";
import {
  AUCTION_DURATIONS_MIN, bankBuyback, BOOSTER_MAX, CARDS_PER_BOOSTER, FACTORY_INTERVAL_SEC, FACTORY_MAX_LEVEL,
  FACTORY_PRODUCT_COST, RARITIES, boosterState, factoryCapacity, factoryInterval, factoryReady, factoryUpgradeCost,
  factoryYield, minNextBid, pickRarity, PRODUCT_FACTORY_BONUS, productFactoryBaseInterval, productFactoryUpgradeCost,
  productFactoryYield, YIELD_POINTS, type Rarity,
} from "./game";
import { pendingRequestCount } from "./social";
import { pendingTradeCount } from "./trades";
import { unreadMessageCount } from "./chat";
import { addCoins, addIngredient, addProduct, takeCoins, takeIngredient, takeProduct } from "./inventory";

const S = schema;

/* ───────────────────────────── Joueur ───────────────────────────── */

export async function getMe(userId: string) {
  const [u] = await db.select().from(S.users).where(eq(S.users.id, userId));
  if (!u) fail("Utilisateur introuvable", 401);
  const b = boosterState(u.boosterStock, u.lastBoosterAt);
  const [friendRequests, tradeRequests, unreadMessages] = await Promise.all([pendingRequestCount(userId), pendingTradeCount(userId), unreadMessageCount(userId)]);
  return { id: u.id, username: u.username, coins: u.coins, boosters: b.available, boosterMax: BOOSTER_MAX, nextBoosterInMs: b.nextInMs, friendRequests, tradeRequests, unreadMessages };
}

/* ───────────────────────────── Boosters ───────────────────────────── */

export async function openBoosters(userId: string, count: number) {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(S.users).where(eq(S.users.id, userId));
    const state = boosterState(u.boosterStock, u.lastBoosterAt);
    if (state.available < count) fail(`Seulement ${state.available} booster(s) disponible(s)`);

    // Mise à jour optimiste : si un autre onglet a ouvert entre-temps, on refuse
    const updated = await tx
      .update(S.users)
      .set({ boosterStock: state.available - count, lastBoosterAt: state.anchor })
      .where(and(eq(S.users.id, userId), eq(S.users.boosterStock, u.boosterStock), eq(S.users.lastBoosterAt, u.lastBoosterAt)))
      .returning({ id: S.users.id });
    if (updated.length === 0) fail("Ouverture simultanée détectée, réessaie", 409);

    const packs: string[][] = [];
    for (let p = 0; p < count; p++) {
      const cards: string[] = [];
      for (let c = 0; c < CARDS_PER_BOOSTER; c++) {
        // Dernière carte garantie au moins « peu commune »
        const rarity = pickRarity(Math.random, c === CARDS_PER_BOOSTER - 1 ? "UNCOMMON" : "COMMON");
        cards.push(await randomIngredient(tx, rarity));
      }
      packs.push(cards);
      for (const id of cards) await addIngredient(tx, userId, id, 1);
      await tx.insert(S.boosterOpenings).values({ userId, cards: JSON.stringify(cards) });
    }

    const ids = [...new Set(packs.flat())];
    const info = await tx.select().from(S.ingredients).where(inArray(S.ingredients.id, ids));
    const byId = new Map(info.map((i) => [i.id, i]));
    return { packs: packs.map((cards) => cards.map((id) => byId.get(id)!)) };
  });
}

async function randomIngredient(tx: Tx, rarity: Rarity): Promise<string> {
  // Si une rareté est vide (petite base), on se rabat sur la plus proche
  const order = [rarity, ...RARITIES.filter((r) => r !== rarity).sort((a, b) => Math.abs(RARITIES.indexOf(a) - RARITIES.indexOf(rarity)) - Math.abs(RARITIES.indexOf(b) - RARITIES.indexOf(rarity)))];
  for (const r of order) {
    const [row] = await tx.select({ id: S.ingredients.id }).from(S.ingredients).where(eq(S.ingredients.rarity, r)).orderBy(sql`random()`).limit(1);
    if (row) return row.id;
  }
  fail("Aucun ingrédient en base — lance le seed", 500);
}

/* ───────────────────────────── Collection ───────────────────────────── */

export async function getCollection(userId: string) {
  const ings = await db
    .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, baseValue: S.ingredients.baseValue, imageUrl: S.ingredients.imageUrl, popularity: S.ingredients.popularity, quantity: S.userIngredients.quantity })
    .from(S.userIngredients)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.userIngredients.ingredientId))
    .where(and(eq(S.userIngredients.userId, userId), gt(S.userIngredients.quantity, 0)))
    .orderBy(asc(S.ingredients.name));
  const prods = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, imageUrl: S.products.imageUrl, rarity: S.products.rarity, quantity: S.userProducts.quantity })
    .from(S.userProducts)
    .innerJoin(S.products, eq(S.products.code, S.userProducts.productCode))
    .where(and(eq(S.userProducts.userId, userId), gt(S.userProducts.quantity, 0)))
    .orderBy(asc(S.products.name));
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(S.ingredients);
  return { ingredients: ings, products: prods, totalIngredients: total };
}

/** Vente immédiate à la banque : prix fixe par carte, quelle que soit la rareté. */
export async function quickSell(userId: string, ingredientId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [ing] = await tx.select().from(S.ingredients).where(eq(S.ingredients.id, ingredientId));
    if (!ing) fail("Ingrédient inconnu", 404);
    await takeIngredient(tx, userId, ingredientId, quantity);
    const earned = bankBuyback(ing.rarity) * quantity;
    await addCoins(tx, userId, earned);
    return { earned };
  });
}

/** Vente de produits à la banque, au prix de rachat de leur rareté. */
export async function quickSellProduct(userId: string, productCode: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(S.products).where(eq(S.products.code, productCode));
    if (!p) fail("Produit inconnu", 404);
    await takeProduct(tx, userId, productCode, quantity);
    const earned = bankBuyback(p.rarity) * quantity;
    await addCoins(tx, userId, earned);
    return { earned };
  });
}

/* ───────────────────────────── Marché (prix fixe) ───────────────────────────── */

export async function createListing(userId: string, ingredientId: string, quantity: number, unitPrice: number) {
  return db.transaction(async (tx) => {
    await takeIngredient(tx, userId, ingredientId, quantity); // mise sous séquestre
    const [l] = await tx.insert(S.listings).values({ sellerId: userId, ingredientId, quantity, unitPrice }).returning();
    return l;
  });
}

export async function buyListing(userId: string, listingId: string) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(S.listings).where(eq(S.listings.id, listingId));
    if (!l || l.status !== "OPEN") fail("Annonce indisponible", 404);
    if (l.sellerId === userId) fail("Tu ne peux pas acheter ta propre annonce");
    const closed = await tx
      .update(S.listings)
      .set({ status: "SOLD", buyerId: userId, closedAt: new Date() })
      .where(and(eq(S.listings.id, listingId), eq(S.listings.status, "OPEN")))
      .returning({ id: S.listings.id });
    if (closed.length === 0) fail("Annonce déjà vendue", 409);
    const total = l.quantity * l.unitPrice;
    await takeCoins(tx, userId, total);
    await addCoins(tx, l.sellerId, total);
    await addIngredient(tx, userId, l.ingredientId, l.quantity);
    return { paid: total };
  });
}

export async function cancelListing(userId: string, listingId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(S.listings)
      .set({ status: "CANCELLED", closedAt: new Date() })
      .where(and(eq(S.listings.id, listingId), eq(S.listings.sellerId, userId), eq(S.listings.status, "OPEN")))
      .returning();
    if (rows.length === 0) fail("Annonce introuvable", 404);
    await addIngredient(tx, userId, rows[0].ingredientId, rows[0].quantity);
  });
}

/* ───────────────────────────── Enchères ───────────────────────────── */

/** Clôture les enchères échues. Appelé à chaque consultation du marché (pas besoin de cron). */
export async function settleAuctions() {
  const due = await db
    .select({ id: S.auctions.id })
    .from(S.auctions)
    .where(and(eq(S.auctions.status, "OPEN"), lte(S.auctions.endsAt, new Date())));
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [a] = await tx.select().from(S.auctions).where(eq(S.auctions.id, id));
      const status = a.leaderId ? "SOLD" : "EXPIRED";
      const claimed = await tx
        .update(S.auctions)
        .set({ status })
        .where(and(eq(S.auctions.id, id), eq(S.auctions.status, "OPEN")))
        .returning({ id: S.auctions.id });
      if (claimed.length === 0) return; // déjà réglée par une autre requête
      if (a.leaderId && a.currentBid != null) {
        await addIngredient(tx, a.leaderId, a.ingredientId, a.quantity); // pièces déjà bloquées à l'enchère
        await addCoins(tx, a.sellerId, a.currentBid);
      } else {
        await addIngredient(tx, a.sellerId, a.ingredientId, a.quantity);
      }
    });
  }
}

export async function createAuction(userId: string, ingredientId: string, quantity: number, startPrice: number, durationMin: number) {
  if (!AUCTION_DURATIONS_MIN.includes(durationMin)) fail("Durée invalide");
  return db.transaction(async (tx) => {
    await takeIngredient(tx, userId, ingredientId, quantity);
    const [a] = await tx
      .insert(S.auctions)
      .values({ sellerId: userId, ingredientId, quantity, startPrice, endsAt: new Date(Date.now() + durationMin * 60_000) })
      .returning();
    return a;
  });
}

export async function placeBid(userId: string, auctionId: string, amount: number) {
  await settleAuctions();
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(S.auctions).where(eq(S.auctions.id, auctionId));
    if (!a || a.status !== "OPEN" || a.endsAt <= new Date()) fail("Enchère terminée", 404);
    if (a.sellerId === userId) fail("Tu ne peux pas enchérir sur ta propre vente");
    if (a.leaderId === userId) fail("Tu es déjà en tête");
    const min = minNextBid(a.startPrice, a.currentBid);
    if (amount < min) fail(`Enchère minimale : ${min} pièces`);

    // Verrou optimiste sur l'enchère courante
    const won = await tx
      .update(S.auctions)
      .set({ currentBid: amount, leaderId: userId })
      .where(and(eq(S.auctions.id, auctionId), a.currentBid == null ? sql`${S.auctions.currentBid} is null` : eq(S.auctions.currentBid, a.currentBid)))
      .returning({ id: S.auctions.id });
    if (won.length === 0) fail("Quelqu'un a enchéri avant toi, actualise", 409);

    await takeCoins(tx, userId, amount); // pièces bloquées
    if (a.leaderId && a.currentBid != null) await addCoins(tx, a.leaderId, a.currentBid); // remboursement du précédent
    await tx.insert(S.bids).values({ auctionId, userId, amount });

    // Anti-sniping : une enchère dans la dernière minute prolonge d'une minute
    const left = a.endsAt.getTime() - Date.now();
    if (left < 60_000) await tx.update(S.auctions).set({ endsAt: new Date(Date.now() + 60_000) }).where(eq(S.auctions.id, auctionId));
    return { amount };
  });
}

export async function getMarket(userId: string, opts: { q?: string; rarity?: string }) {
  await settleAuctions();
  const filters = (table: typeof S.listings | typeof S.auctions) => {
    const f = [eq(table.status, "OPEN")];
    if (opts.q) f.push(like(S.ingredients.name, `%${opts.q}%`));
    if (opts.rarity && (RARITIES as readonly string[]).includes(opts.rarity)) f.push(eq(S.ingredients.rarity, opts.rarity));
    return and(...f);
  };
  const ingCols = { ingredientName: S.ingredients.name, rarity: S.ingredients.rarity, baseValue: S.ingredients.baseValue, imageUrl: S.ingredients.imageUrl };

  const listings = await db
    .select({ id: S.listings.id, ingredientId: S.listings.ingredientId, quantity: S.listings.quantity, unitPrice: S.listings.unitPrice, createdAt: S.listings.createdAt, seller: S.users.username, mine: sql<number>`${S.listings.sellerId} = ${userId}`, ...ingCols })
    .from(S.listings)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.listings.ingredientId))
    .innerJoin(S.users, eq(S.users.id, S.listings.sellerId))
    .where(filters(S.listings))
    .orderBy(desc(S.listings.createdAt))
    .limit(100);

  const leader = alias(S.users, "leader");
  const auctions = await db
    .select({ id: S.auctions.id, ingredientId: S.auctions.ingredientId, quantity: S.auctions.quantity, startPrice: S.auctions.startPrice, currentBid: S.auctions.currentBid, endsAt: S.auctions.endsAt, seller: S.users.username, leader: leader.username, mine: sql<number>`${S.auctions.sellerId} = ${userId}`, leading: sql<number>`coalesce(${S.auctions.leaderId} = ${userId}, 0)`, ...ingCols })
    .from(S.auctions)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.auctions.ingredientId))
    .innerJoin(S.users, eq(S.users.id, S.auctions.sellerId))
    .leftJoin(leader, eq(leader.id, S.auctions.leaderId))
    .where(filters(S.auctions))
    .orderBy(asc(S.auctions.endsAt))
    .limit(100);

  return {
    listings: listings.map((l) => ({ ...l, mine: !!l.mine })),
    auctions: auctions.map((a) => ({ ...a, mine: !!a.mine, leading: !!a.leading, minBid: minNextBid(a.startPrice, a.currentBid) })),
  };
}

/* ───────────────────────────── Produits / fabrication ───────────────────────────── */

const PAGE_SIZE = 24;

export async function getProducts(userId: string, opts: { q?: string; filter?: string; ingredient?: string; page: number }) {
  // Nombre d'ingrédients manquants calculé en SQL pour trier « le plus proche d'être fabricable »
  const missingExpr = sql<number>`(
    select count(*) from ${S.productIngredients} pi
    left join ${S.userIngredients} ui on ui.ingredient_id = pi.ingredient_id and ui.user_id = ${userId}
    where pi.product_code = ${S.products.code} and coalesce(ui.quantity, 0) < 1)`;
  const totalExpr = sql<number>`(select count(*) from ${S.productIngredients} pi where pi.product_code = ${S.products.code})`;
  const ownedExpr = sql<number>`coalesce((select quantity from ${S.userProducts} up where up.product_code = ${S.products.code} and up.user_id = ${userId}), 0)`;

  const where = [];
  if (opts.q) where.push(like(S.products.name, `%${opts.q}%`));
  if (opts.filter === "craftable") where.push(sql`${missingExpr} = 0`);
  if (opts.filter === "owned") where.push(sql`${ownedExpr} > 0`);
  // Produits qui contiennent un ingrédient donné (sous-menu de construction d'usine)
  if (opts.ingredient) where.push(sql`exists (select 1 from ${S.productIngredients} pi where pi.product_code = ${S.products.code} and pi.ingredient_id = ${opts.ingredient})`);

  const rows = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, imageUrl: S.products.imageUrl, rarity: S.products.rarity, popularity: S.products.popularity, missing: missingExpr, total: totalExpr, owned: ownedExpr })
    .from(S.products)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(missingExpr), sql`${totalExpr} - ${missingExpr} desc`, desc(S.products.popularity))
    .limit(PAGE_SIZE + 1)
    .offset((opts.page - 1) * PAGE_SIZE);

  const page = rows.slice(0, PAGE_SIZE);
  const codes = page.map((p) => p.code);
  const ings = codes.length
    ? await db
        .select({ productCode: S.productIngredients.productCode, id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, have: sql<number>`coalesce(${S.userIngredients.quantity}, 0)` })
        .from(S.productIngredients)
        .innerJoin(S.ingredients, eq(S.ingredients.id, S.productIngredients.ingredientId))
        .leftJoin(S.userIngredients, and(eq(S.userIngredients.ingredientId, S.ingredients.id), eq(S.userIngredients.userId, userId)))
        .where(inArray(S.productIngredients.productCode, codes))
    : [];
  return {
    products: page.map((p) => ({ ...p, ingredients: ings.filter((i) => i.productCode === p.code).map(({ productCode: _, ...i }) => i) })),
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function craftProduct(userId: string, code: string, quantity = 1) {
  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(S.products).where(eq(S.products.code, code));
    if (!product) fail("Produit inconnu", 404);
    const ings = await tx.select().from(S.productIngredients).where(eq(S.productIngredients.productCode, code));
    for (const i of ings) await takeIngredient(tx, userId, i.ingredientId, quantity);
    await addProduct(tx, userId, code, quantity);
    return { product, quantity };
  });
}

/* ───────────────────────────── Usines ───────────────────────────── */

type FactoryRow = { intervalSec: number; level: number; lastCollectedAt: Date };
const effective = (f: FactoryRow) => ({ interval: factoryInterval(f.intervalSec, f.level), capacity: factoryCapacity(f.level) });

export async function getFactories(userId: string) {
  const list = await db
    .select({ id: S.factories.id, ingredientId: S.factories.ingredientId, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, intervalSec: S.factories.intervalSec, level: S.factories.level, lastCollectedAt: S.factories.lastCollectedAt, stock: S.userIngredients.quantity })
    .from(S.factories)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.factories.ingredientId))
    .leftJoin(S.userIngredients, and(eq(S.userIngredients.userId, userId), eq(S.userIngredients.ingredientId, S.factories.ingredientId)))
    .where(eq(S.factories.userId, userId))
    .orderBy(asc(S.factories.createdAt));
  const [me] = await db.select({ coins: S.users.coins }).from(S.users).where(eq(S.users.id, userId));
  const now = new Date();
  const factories = list.map((f) => {
    const { interval, capacity } = effective(f);
    const rarity = f.rarity as Rarity;
    const maxed = f.level >= FACTORY_MAX_LEVEL;
    const cost = maxed ? null : factoryUpgradeCost(f.level, rarity);
    return {
      ...f,
      stock: f.stock ?? 0,
      interval,
      capacity,
      yieldPerHour: factoryYield(f.intervalSec, f.level, rarity),
      ...factoryReady(interval, capacity, f.lastCollectedAt, now),
      upgrade: cost && {
        ...cost,
        nextLevel: f.level + 1,
        nextInterval: factoryInterval(f.intervalSec, f.level + 1),
        nextCapacity: factoryCapacity(f.level + 1),
        nextYield: factoryYield(f.intervalSec, f.level + 1, rarity),
        affordable: me.coins >= cost.coins && (f.stock ?? 0) >= cost.cards,
      },
    };
  });

  // Produits possédés, regroupés par ingrédient : alimente le sous-menu de construction
  const owned = await db
    .select({ ingredientId: S.ingredients.id, ingredientName: S.ingredients.name, ingredientRarity: S.ingredients.rarity, ingredientImage: S.ingredients.imageUrl, code: S.products.code, name: S.products.name, imageUrl: S.products.imageUrl, rarity: S.products.rarity, quantity: S.userProducts.quantity })
    .from(S.userProducts)
    .innerJoin(S.products, eq(S.products.code, S.userProducts.productCode))
    .innerJoin(S.productIngredients, eq(S.productIngredients.productCode, S.userProducts.productCode))
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.productIngredients.ingredientId))
    .where(and(eq(S.userProducts.userId, userId), gt(S.userProducts.quantity, 0)))
    .orderBy(asc(S.ingredients.name), desc(S.products.popularity));
  const byIng = new Map<string, { id: string; name: string; rarity: string; imageUrl: string | null; products: { code: string; name: string; imageUrl: string | null; rarity: string; quantity: number }[] }>();
  for (const o of owned) {
    const e = byIng.get(o.ingredientId) ?? { id: o.ingredientId, name: o.ingredientName, rarity: o.ingredientRarity, imageUrl: o.ingredientImage, products: [] };
    e.products.push({ code: o.code, name: o.name, imageUrl: o.imageUrl, rarity: o.rarity, quantity: o.quantity });
    byIng.set(o.ingredientId, e);
  }
  const built = new Set(factories.map((f) => f.ingredientId)); // une seule usine par ingrédient
  const options = [...byIng.values()]
    .filter((o) => !built.has(o.id))
    .map((o) => {
      const rarity = o.rarity as Rarity;
      const available = o.products.reduce((n, p) => n + p.quantity, 0);
      return { ...o, available, canBuild: available >= FACTORY_PRODUCT_COST, intervalSec: FACTORY_INTERVAL_SEC[rarity], yieldPerHour: factoryYield(FACTORY_INTERVAL_SEC[rarity], 1, rarity) };
    })
    // Les plus avancées d'abord : 3/3, puis 2/3, puis 1/3 ; à égalité, la plus rentable
    .sort((a, b) => Math.min(b.available, FACTORY_PRODUCT_COST) - Math.min(a.available, FACTORY_PRODUCT_COST) || b.yieldPerHour - a.yieldPerHour || a.name.localeCompare(b.name));

  const product = await getProductFactories(userId, factories, me.coins, now);
  // Indicateurs : ingrédients et produits équipés d'une usine, sur le total du catalogue
  const [[{ totalIngredients }], [{ totalProducts }]] = await Promise.all([
    db.select({ totalIngredients: sql<number>`count(*)` }).from(S.ingredients),
    db.select({ totalProducts: sql<number>`count(*)` }).from(S.products),
  ]);
  const coverage = {
    ingredients: new Set(factories.map((f) => f.ingredientId)).size,
    totalIngredients,
    products: new Set(product.list.map((f) => f.productCode)).size,
    totalProducts,
  };

  return {
    factories,
    options,
    cost: FACTORY_PRODUCT_COST,
    maxLevel: FACTORY_MAX_LEVEL,
    productFactories: product.list,
    productOptions: product.options,
    productBonus: PRODUCT_FACTORY_BONUS,
    coverage,
    score: Math.round((factories.reduce((n, f) => n + f.yieldPerHour, 0) + product.list.reduce((n, f) => n + f.yieldPerHour, 0)) * 10) / 10,
  };
}

/* ───────────────────────────── Usines de produits ───────────────────────────── */

type IngFactory = { id: string; ingredientId: string; level: number; yieldPerHour: number; name: string; rarity: string; imageUrl: string | null; interval: number };

/** Points de rendement d'un produit = somme des points de ses ingrédients. */
async function productPoints(tx: Tx | typeof db, code: string) {
  const rows = await tx
    .select({ rarity: S.ingredients.rarity })
    .from(S.productIngredients)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.productIngredients.ingredientId))
    .where(eq(S.productIngredients.productCode, code));
  return rows.reduce((n, r) => n + YIELD_POINTS[r.rarity as Rarity], 0);
}

async function getProductFactories(userId: string, ingFactories: IngFactory[], coins: number, now: Date) {
  const rows = await db
    .select({ id: S.productFactories.id, productCode: S.productFactories.productCode, intervalSec: S.productFactories.intervalSec, points: S.productFactories.points, level: S.productFactories.level, lastCollectedAt: S.productFactories.lastCollectedAt, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl, stock: S.userProducts.quantity })
    .from(S.productFactories)
    .innerJoin(S.products, eq(S.products.code, S.productFactories.productCode))
    .leftJoin(S.userProducts, and(eq(S.userProducts.userId, userId), eq(S.userProducts.productCode, S.productFactories.productCode)))
    .where(eq(S.productFactories.userId, userId))
    .orderBy(asc(S.productFactories.createdAt));

  const list = rows.map((f) => {
    const interval = factoryInterval(f.intervalSec, f.level);
    const capacity = factoryCapacity(f.level);
    const maxed = f.level >= FACTORY_MAX_LEVEL;
    const cost = maxed ? null : productFactoryUpgradeCost(f.level, f.rarity as Rarity);
    return {
      ...f,
      stock: f.stock ?? 0,
      interval,
      capacity,
      yieldPerHour: productFactoryYield(f.intervalSec, f.level, f.points),
      ...factoryReady(interval, capacity, f.lastCollectedAt, now),
      upgrade: cost && {
        ...cost,
        nextLevel: f.level + 1,
        nextInterval: factoryInterval(f.intervalSec, f.level + 1),
        nextCapacity: factoryCapacity(f.level + 1),
        nextYield: productFactoryYield(f.intervalSec, f.level + 1, f.points),
        affordable: coins >= cost.coins && (f.stock ?? 0) >= cost.cards,
      },
    };
  });

  // Produits fabricables par fusion : au moins un ingrédient couvert par une usine du joueur
  const byIng = new Map<string, IngFactory[]>();
  for (const f of ingFactories) byIng.set(f.ingredientId, [...(byIng.get(f.ingredientId) ?? []), f]);
  if (byIng.size === 0) return { list, options: [] };

  const covered = await db
    .select({ code: S.productIngredients.productCode, n: sql<number>`count(*)` })
    .from(S.productIngredients)
    .where(inArray(S.productIngredients.ingredientId, [...byIng.keys()]))
    .groupBy(S.productIngredients.productCode);
  const codes = covered.map((c) => c.code);
  if (codes.length === 0) return { list, options: [] };
  const recipes = await db
    .select({ code: S.products.code, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl, popularity: S.products.popularity, ingredientId: S.ingredients.id, ingredientName: S.ingredients.name, ingredientRarity: S.ingredients.rarity, ingredientImage: S.ingredients.imageUrl })
    .from(S.productIngredients)
    .innerJoin(S.products, eq(S.products.code, S.productIngredients.productCode))
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.productIngredients.ingredientId))
    .where(inArray(S.productIngredients.productCode, codes));

  type Opt = { code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; popularity: number; points: number; ingredients: { id: string; name: string; rarity: string; imageUrl: string | null; factories: IngFactory[] }[] };
  const opts = new Map<string, Opt>();
  for (const r of recipes) {
    const o = opts.get(r.code) ?? { code: r.code, name: r.name, brand: r.brand, rarity: r.rarity, imageUrl: r.imageUrl, popularity: r.popularity, points: 0, ingredients: [] };
    o.points += YIELD_POINTS[r.ingredientRarity as Rarity];
    // Usines disponibles pour cet ingrédient, les plus rentables d'abord
    o.ingredients.push({ id: r.ingredientId, name: r.ingredientName, rarity: r.ingredientRarity, imageUrl: r.ingredientImage, factories: [...(byIng.get(r.ingredientId) ?? [])].sort((a, b) => b.yieldPerHour - a.yieldPerHour) });
    opts.set(r.code, o);
  }
  const builtProducts = new Set(list.map((f) => f.productCode)); // une seule usine par produit
  const options = [...opts.values()]
    .filter((o) => !builtProducts.has(o.code))
    .map((o) => {
      const missing = o.ingredients.filter((i) => i.factories.length === 0).length;
      const consumedYield = o.ingredients.reduce((n, i) => n + (i.factories[0]?.yieldPerHour ?? 0), 0);
      const base = productFactoryBaseInterval(consumedYield, o.points);
      return { ...o, missing, total: o.ingredients.length, consumedYield: Math.round(consumedYield * 10) / 10, preview: missing ? null : { interval: factoryInterval(base, 1), yieldPerHour: productFactoryYield(base, 1, o.points) } };
    })
    .sort((a, b) => a.missing - b.missing || a.total - b.total || b.popularity - a.popularity)
    .slice(0, 40);
  return { list, options };
}

/** Fusionne une usine par ingrédient du produit en une usine de produits. */
export async function buildProductFactory(userId: string, productCode: string, factoryIds: string[]) {
  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(S.products).where(eq(S.products.code, productCode));
    if (!product) fail("Produit inconnu", 404);
    const owned = () => tx.select({ n: sql<number>`count(*)` }).from(S.productFactories).where(and(eq(S.productFactories.userId, userId), eq(S.productFactories.productCode, productCode)));
    if ((await owned())[0].n > 0) fail(`Tu as déjà une usine de « ${product.name} » : améliore-la plutôt (une usine par produit)`, 409);
    const recipe = await tx.select({ id: S.productIngredients.ingredientId }).from(S.productIngredients).where(eq(S.productIngredients.productCode, productCode));
    const ids = [...new Set(factoryIds)];
    if (ids.length !== recipe.length) fail(`Il faut exactement une usine par ingrédient (${recipe.length})`);
    const chosen = await tx
      .select({ id: S.factories.id, ingredientId: S.factories.ingredientId, intervalSec: S.factories.intervalSec, level: S.factories.level, rarity: S.ingredients.rarity })
      .from(S.factories)
      .innerJoin(S.ingredients, eq(S.ingredients.id, S.factories.ingredientId))
      .where(and(eq(S.factories.userId, userId), inArray(S.factories.id, ids)));
    if (chosen.length !== ids.length) fail("Usine introuvable", 404);
    const need = new Set(recipe.map((r) => r.id));
    const got = new Set(chosen.map((c) => c.ingredientId));
    if (got.size !== chosen.length || [...need].some((i) => !got.has(i))) fail("Choisis une usine pour chaque ingrédient de la recette");

    // La production en attente des usines fusionnées est récoltée avant leur démolition
    const now = new Date();
    for (const c of chosen) {
      const [f] = await tx.select().from(S.factories).where(eq(S.factories.id, c.id));
      await settleFactory(tx, userId, f, now);
    }
    const consumedYield = chosen.reduce((n, c) => n + factoryYield(c.intervalSec, c.level, c.rarity as Rarity), 0);
    const points = await productPoints(tx, productCode);
    const intervalSec = productFactoryBaseInterval(consumedYield, points);
    const del = await tx.delete(S.factories).where(and(eq(S.factories.userId, userId), inArray(S.factories.id, ids))).returning({ id: S.factories.id });
    if (del.length !== ids.length) fail("Usines déjà utilisées", 409);
    const [pf] = await tx.insert(S.productFactories).values({ userId, productCode, intervalSec, points, level: 1 }).returning();
    if ((await owned())[0].n > 1) fail(`Tu as déjà une usine de « ${product.name} »`, 409);
    return {
      factory: { ...pf, name: product.name, brand: product.brand, rarity: product.rarity, imageUrl: product.imageUrl, interval: factoryInterval(intervalSec, 1), yieldPerHour: productFactoryYield(intervalSec, 1, points) },
      consumedYield: Math.round(consumedYield * 10) / 10,
    };
  });
}

export async function collectProductFactory(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(S.productFactories).where(and(eq(S.productFactories.id, id), eq(S.productFactories.userId, userId)));
    if (!f) fail("Usine introuvable", 404);
    const now = new Date();
    const interval = factoryInterval(f.intervalSec, f.level), capacity = factoryCapacity(f.level);
    const { ready } = factoryReady(interval, capacity, f.lastCollectedAt, now);
    if (ready === 0) fail("Rien à récolter pour l'instant");
    const cycles = Math.floor((now.getTime() - f.lastCollectedAt.getTime()) / (interval * 1000));
    const next = cycles > capacity ? now : new Date(f.lastCollectedAt.getTime() + ready * interval * 1000);
    const upd = await tx.update(S.productFactories).set({ lastCollectedAt: next })
      .where(and(eq(S.productFactories.id, id), eq(S.productFactories.lastCollectedAt, f.lastCollectedAt))).returning({ id: S.productFactories.id });
    if (upd.length === 0) fail("Récolte déjà effectuée", 409);
    await addProduct(tx, userId, f.productCode, ready);
    return { collected: ready };
  });
}

export async function upgradeProductFactory(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(S.productFactories).where(and(eq(S.productFactories.id, id), eq(S.productFactories.userId, userId)));
    if (!f) fail("Usine introuvable", 404);
    if (f.level >= FACTORY_MAX_LEVEL) fail("Niveau maximal atteint");
    const [p] = await tx.select({ rarity: S.products.rarity }).from(S.products).where(eq(S.products.code, f.productCode));
    const now = new Date();
    // Récolte d'abord ce qui est prêt (peut servir à payer l'amélioration)
    const interval = factoryInterval(f.intervalSec, f.level), capacity = factoryCapacity(f.level);
    const { ready } = factoryReady(interval, capacity, f.lastCollectedAt, now);
    if (ready > 0) await addProduct(tx, userId, f.productCode, ready);
    const cycles = Math.floor((now.getTime() - f.lastCollectedAt.getTime()) / (interval * 1000));
    const start = cycles > capacity ? now : new Date(f.lastCollectedAt.getTime() + ready * interval * 1000);
    const progress = Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (interval * 1000)));
    const cost = productFactoryUpgradeCost(f.level, p.rarity as Rarity);
    await takeCoins(tx, userId, cost.coins);
    await takeProduct(tx, userId, f.productCode, cost.cards);
    const level = f.level + 1;
    const lastCollectedAt = new Date(now.getTime() - progress * factoryInterval(f.intervalSec, level) * 1000);
    const upd = await tx.update(S.productFactories).set({ level, lastCollectedAt })
      .where(and(eq(S.productFactories.id, id), eq(S.productFactories.level, f.level))).returning({ id: S.productFactories.id });
    if (upd.length === 0) fail("Amélioration déjà effectuée", 409);
    return { level, collected: ready, yieldPerHour: productFactoryYield(f.intervalSec, level, f.points) };
  });
}

/** Construit une usine en consommant exactement les produits choisis par le joueur. */
export async function buildFactory(userId: string, ingredientId: string, selection: { code: string; quantity: number }[]) {
  const total = selection.reduce((n, s) => n + s.quantity, 0);
  if (total !== FACTORY_PRODUCT_COST) fail(`Choisis exactement ${FACTORY_PRODUCT_COST} produits`);
  return db.transaction(async (tx) => {
    const [ing] = await tx.select().from(S.ingredients).where(eq(S.ingredients.id, ingredientId));
    if (!ing) fail("Ingrédient inconnu", 404);
    const owned = () => tx.select({ n: sql<number>`count(*)` }).from(S.factories).where(and(eq(S.factories.userId, userId), eq(S.factories.ingredientId, ingredientId)));
    if ((await owned())[0].n > 0) fail(`Tu as déjà une usine à « ${ing.name} » : améliore-la plutôt (une usine par ingrédient)`, 409);
    const codes = [...new Set(selection.map((s) => s.code))];
    const valid = await tx
      .select({ code: S.productIngredients.productCode })
      .from(S.productIngredients)
      .where(and(eq(S.productIngredients.ingredientId, ingredientId), inArray(S.productIngredients.productCode, codes)));
    if (valid.length !== codes.length) fail(`Chaque produit doit contenir « ${ing.name} »`);
    for (const s of selection) await takeProduct(tx, userId, s.code, s.quantity);
    const rarity = ing.rarity as Rarity;
    const [f] = await tx
      .insert(S.factories)
      .values({ userId, ingredientId, intervalSec: FACTORY_INTERVAL_SEC[rarity], level: 1, capacity: factoryCapacity(1) })
      .returning();
    // Garde-fou si deux constructions partent au même instant
    if ((await owned())[0].n > 1) fail(`Tu as déjà une usine à « ${ing.name} »`, 409);
    return { factory: { ...f, name: ing.name, rarity: ing.rarity, imageUrl: ing.imageUrl, yieldPerHour: factoryYield(f.intervalSec, 1, rarity), interval: factoryInterval(f.intervalSec, 1) } };
  });
}

/** Ajoute la production prête à l'inventaire et renvoie le nouveau point de départ du cycle. */
async function settleFactory(tx: Tx, userId: string, f: typeof S.factories.$inferSelect, now: Date) {
  const { interval, capacity } = effective(f);
  const { ready } = factoryReady(interval, capacity, f.lastCollectedAt, now);
  const elapsedCycles = Math.floor((now.getTime() - f.lastCollectedAt.getTime()) / (interval * 1000));
  // Stock plein : la production était à l'arrêt, le cycle repart maintenant ; sinon on garde le cycle entamé
  const nextStart = elapsedCycles > capacity ? now : new Date(f.lastCollectedAt.getTime() + ready * interval * 1000);
  if (ready > 0) await addIngredient(tx, userId, f.ingredientId, ready);
  return { ready, nextStart, progress: (now.getTime() - nextStart.getTime()) / (interval * 1000) };
}

export async function collectFactory(userId: string, factoryId: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(S.factories).where(and(eq(S.factories.id, factoryId), eq(S.factories.userId, userId)));
    if (!f) fail("Usine introuvable", 404);
    const now = new Date();
    const { ready, nextStart } = await settleFactory(tx, userId, f, now);
    if (ready === 0) fail("Rien à récolter pour l'instant");
    const upd = await tx
      .update(S.factories)
      .set({ lastCollectedAt: nextStart })
      .where(and(eq(S.factories.id, factoryId), eq(S.factories.lastCollectedAt, f.lastCollectedAt)))
      .returning({ id: S.factories.id });
    if (upd.length === 0) fail("Récolte déjà effectuée", 409);
    return { collected: ready };
  });
}

/** Passe l'usine au niveau supérieur : récolte d'abord, puis paie en pièces et en cartes. */
export async function upgradeFactory(userId: string, factoryId: string) {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(S.factories).where(and(eq(S.factories.id, factoryId), eq(S.factories.userId, userId)));
    if (!f) fail("Usine introuvable", 404);
    if (f.level >= FACTORY_MAX_LEVEL) fail("Niveau maximal atteint");
    const [ing] = await tx.select().from(S.ingredients).where(eq(S.ingredients.id, f.ingredientId));
    const rarity = ing.rarity as Rarity;
    const now = new Date();
    // La production prête est versée avant l'amélioration (et peut servir à la payer)
    const { ready, progress } = await settleFactory(tx, userId, f, now);
    const cost = factoryUpgradeCost(f.level, rarity);
    await takeCoins(tx, userId, cost.coins);
    await takeIngredient(tx, userId, f.ingredientId, cost.cards);
    const level = f.level + 1;
    // Le cycle entamé est conservé en proportion, à la nouvelle cadence
    const newInterval = factoryInterval(f.intervalSec, level);
    const lastCollectedAt = new Date(now.getTime() - Math.min(1, Math.max(0, progress)) * newInterval * 1000);
    const upd = await tx
      .update(S.factories)
      .set({ level, capacity: factoryCapacity(level), lastCollectedAt })
      .where(and(eq(S.factories.id, factoryId), eq(S.factories.level, f.level)))
      .returning({ id: S.factories.id });
    if (upd.length === 0) fail("Amélioration déjà effectuée", 409);
    return { level, collected: ready, yieldPerHour: factoryYield(f.intervalSec, level, rarity) };
  });
}

/** Récolte de toutes les usines (ingrédients et produits) en une seule transaction. */
export async function collectAll(userId: string) {
  return db.transaction(async (tx) => {
    const now = new Date();
    let cards = 0, products = 0, factories = 0;
    const ing = await tx.select().from(S.factories).where(eq(S.factories.userId, userId));
    for (const f of ing) {
      const { ready, nextStart } = await settleFactory(tx, userId, f, now);
      if (ready === 0) continue;
      const upd = await tx.update(S.factories).set({ lastCollectedAt: nextStart })
        .where(and(eq(S.factories.id, f.id), eq(S.factories.lastCollectedAt, f.lastCollectedAt))).returning({ id: S.factories.id });
      if (upd.length === 0) fail("Récolte déjà effectuée", 409);
      cards += ready; factories++;
    }
    const prod = await tx.select().from(S.productFactories).where(eq(S.productFactories.userId, userId));
    for (const f of prod) {
      const interval = factoryInterval(f.intervalSec, f.level), capacity = factoryCapacity(f.level);
      const { ready } = factoryReady(interval, capacity, f.lastCollectedAt, now);
      if (ready === 0) continue;
      const cycles = Math.floor((now.getTime() - f.lastCollectedAt.getTime()) / (interval * 1000));
      const next = cycles > capacity ? now : new Date(f.lastCollectedAt.getTime() + ready * interval * 1000);
      const upd = await tx.update(S.productFactories).set({ lastCollectedAt: next })
        .where(and(eq(S.productFactories.id, f.id), eq(S.productFactories.lastCollectedAt, f.lastCollectedAt))).returning({ id: S.productFactories.id });
      if (upd.length === 0) fail("Récolte déjà effectuée", 409);
      await addProduct(tx, userId, f.productCode, ready);
      products += ready; factories++;
    }
    if (factories === 0) fail("Rien à récolter pour l'instant");
    return { cards, products, factories };
  });
}
