import "server-only";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { fail } from "./api";
import { addCoins, addIngredient, addProduct, takeCoins, takeIngredient, takeProduct } from "./inventory";

const S = schema;

export type TradeLine = { kind: "INGREDIENT" | "PRODUCT"; id: string; quantity: number };
export type TradeSide = { coins: number; items: TradeLine[] };

const MAX_LINES = 20;
const MAX_QTY = 1000;
const MAX_COINS = 1_000_000;

async function areFriends(tx: Tx | typeof db, a: string, b: string) {
  const [row] = await tx
    .select({ id: S.friendships.id })
    .from(S.friendships)
    .where(and(eq(S.friendships.status, "ACCEPTED"), or(
      and(eq(S.friendships.requesterId, a), eq(S.friendships.addresseeId, b)),
      and(eq(S.friendships.requesterId, b), eq(S.friendships.addresseeId, a)),
    )));
  return !!row;
}

/** Valide et regroupe une moitié d'échange (doublons fusionnés). */
export function normalizeSide(side: unknown, label: string): TradeSide {
  const s = (side ?? {}) as { coins?: unknown; items?: unknown };
  const coins = s.coins == null || s.coins === "" ? 0 : Number(s.coins);
  if (!Number.isInteger(coins) || coins < 0 || coins > MAX_COINS) fail(`Montant de pièces invalide (${label})`);
  const raw = Array.isArray(s.items) ? s.items : [];
  const merged = new Map<string, TradeLine>();
  for (const it of raw as { kind?: unknown; id?: unknown; quantity?: unknown }[]) {
    const kind = it?.kind === "PRODUCT" ? "PRODUCT" : it?.kind === "INGREDIENT" ? "INGREDIENT" : null;
    const qty = Number(it?.quantity);
    if (!kind || typeof it.id !== "string" || !it.id || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) fail(`Carte invalide (${label})`);
    const key = `${kind}:${it.id}`;
    const prev = merged.get(key);
    merged.set(key, { kind, id: it.id, quantity: (prev?.quantity ?? 0) + qty });
  }
  if (merged.size > MAX_LINES) fail(`Maximum ${MAX_LINES} cartes différentes par côté`);
  return { coins, items: [...merged.values()] };
}

async function take(tx: Tx, userId: string, side: TradeSide) {
  if (side.coins) await takeCoins(tx, userId, side.coins);
  for (const it of side.items) {
    if (it.kind === "INGREDIENT") await takeIngredient(tx, userId, it.id, it.quantity);
    else await takeProduct(tx, userId, it.id, it.quantity);
  }
}

async function give(tx: Tx, userId: string, side: TradeSide) {
  if (side.coins) await addCoins(tx, userId, side.coins);
  for (const it of side.items) {
    if (it.kind === "INGREDIENT") await addIngredient(tx, userId, it.id, it.quantity);
    else await addProduct(tx, userId, it.id, it.quantity);
  }
}

/** Vérifie que toutes les cartes citées existent. */
async function assertCardsExist(tx: Tx, sides: TradeSide[]) {
  const ing = [...new Set(sides.flatMap((s) => s.items.filter((i) => i.kind === "INGREDIENT").map((i) => i.id)))];
  const prod = [...new Set(sides.flatMap((s) => s.items.filter((i) => i.kind === "PRODUCT").map((i) => i.id)))];
  if (ing.length && (await tx.select({ id: S.ingredients.id }).from(S.ingredients).where(inArray(S.ingredients.id, ing))).length !== ing.length) fail("Ingrédient inconnu");
  if (prod.length && (await tx.select({ c: S.products.code }).from(S.products).where(inArray(S.products.code, prod))).length !== prod.length) fail("Produit inconnu");
}

export async function proposeTrade(userId: string, toUserId: string, offer: TradeSide, request: TradeSide, message?: string) {
  if (toUserId === userId) fail("Tu ne peux pas échanger avec toi-même");
  if (!offer.coins && !offer.items.length && !request.coins && !request.items.length) fail("L'échange est vide");
  const msg = message?.trim().slice(0, 200) || null;
  return db.transaction(async (tx) => {
    if (!(await areFriends(tx, userId, toUserId))) fail("Tu ne peux échanger qu'avec tes amis", 403);
    await assertCardsExist(tx, [offer, request]);
    await take(tx, userId, offer); // séquestre : échoue si tu n'as pas tout
    const [t] = await tx
      .insert(S.trades)
      .values({ fromUserId: userId, toUserId, offerCoins: offer.coins, requestCoins: request.coins, message: msg })
      .returning();
    const lines = [
      ...offer.items.map((i) => ({ tradeId: t.id, side: "OFFER", kind: i.kind, refId: i.id, quantity: i.quantity })),
      ...request.items.map((i) => ({ tradeId: t.id, side: "REQUEST", kind: i.kind, refId: i.id, quantity: i.quantity })),
    ];
    if (lines.length) await tx.insert(S.tradeItems).values(lines);
    return { id: t.id };
  });
}

async function loadSides(tx: Tx, tradeId: string, offerCoins: number, requestCoins: number) {
  const lines = await tx.select().from(S.tradeItems).where(eq(S.tradeItems.tradeId, tradeId));
  const pick = (side: string): TradeLine[] => lines.filter((l) => l.side === side).map((l) => ({ kind: l.kind as TradeLine["kind"], id: l.refId, quantity: l.quantity }));
  return { offer: { coins: offerCoins, items: pick("OFFER") }, request: { coins: requestCoins, items: pick("REQUEST") } };
}

/** Le destinataire accepte : il paie ce qui est demandé et reçoit l'offre déjà mise de côté. */
export async function acceptTrade(userId: string, tradeId: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(S.trades).where(eq(S.trades.id, tradeId));
    if (!t || t.toUserId !== userId) fail("Échange introuvable", 404);
    if (t.status !== "PENDING") fail("Cet échange n'est plus en attente", 409);
    if (!(await areFriends(tx, t.fromUserId, t.toUserId))) fail("Vous n'êtes plus amis : refuse cet échange pour rendre les cartes", 403);
    const claimed = await tx
      .update(S.trades)
      .set({ status: "ACCEPTED", closedAt: new Date() })
      .where(and(eq(S.trades.id, tradeId), eq(S.trades.status, "PENDING")))
      .returning({ id: S.trades.id });
    if (claimed.length === 0) fail("Cet échange n'est plus en attente", 409);
    const { offer, request } = await loadSides(tx, t.id, t.offerCoins, t.requestCoins);
    try {
      await take(tx, userId, request);
    } catch (e) {
      fail(`Il te manque une partie de ce qui est demandé (${(e as Error).message.toLowerCase()})`);
    }
    await give(tx, t.fromUserId, request);
    await give(tx, userId, offer);
    return { accepted: true };
  });
}

/** Refus (destinataire) ou annulation (expéditeur) : l'offre retourne à l'expéditeur. */
export async function closeTrade(userId: string, tradeId: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(S.trades).where(eq(S.trades.id, tradeId));
    if (!t || (t.toUserId !== userId && t.fromUserId !== userId)) fail("Échange introuvable", 404);
    const status = t.fromUserId === userId ? "CANCELLED" : "DECLINED";
    const done = await tx
      .update(S.trades)
      .set({ status, closedAt: new Date() })
      .where(and(eq(S.trades.id, tradeId), eq(S.trades.status, "PENDING")))
      .returning({ id: S.trades.id });
    if (done.length === 0) fail("Cet échange n'est plus en attente", 409);
    const { offer } = await loadSides(tx, t.id, t.offerCoins, t.requestCoins);
    await give(tx, t.fromUserId, offer);
    return { status };
  });
}

export async function pendingTradeCount(userId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(S.trades).where(and(eq(S.trades.toUserId, userId), eq(S.trades.status, "PENDING")));
  return n;
}

/** Échanges du joueur, avec le détail des cartes. */
export async function listTrades(userId: string) {
  const rows = await db
    .select()
    .from(S.trades)
    .where(or(eq(S.trades.fromUserId, userId), eq(S.trades.toUserId, userId)))
    .orderBy(desc(S.trades.createdAt))
    .limit(60);
  const ids = rows.map((r) => r.id);
  const lines = ids.length ? await db.select().from(S.tradeItems).where(inArray(S.tradeItems.tradeId, ids)) : [];
  const userIds = [...new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId]))];
  const users = userIds.length ? await db.select({ id: S.users.id, username: S.users.username }).from(S.users).where(inArray(S.users.id, userIds)) : [];
  const ingIds = [...new Set(lines.filter((l) => l.kind === "INGREDIENT").map((l) => l.refId))];
  const prodIds = [...new Set(lines.filter((l) => l.kind === "PRODUCT").map((l) => l.refId))];
  const ings = ingIds.length ? await db.select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl }).from(S.ingredients).where(inArray(S.ingredients.id, ingIds)) : [];
  const prods = prodIds.length ? await db.select({ id: S.products.code, name: S.products.name, rarity: S.products.rarity, imageUrl: S.products.imageUrl }).from(S.products).where(inArray(S.products.code, prodIds)) : [];
  type Card = { id: string; name: string; rarity: string; imageUrl: string | null };
  const card = new Map<string, Card>([...ings.map((i) => [`INGREDIENT:${i.id}`, i] as [string, Card]), ...prods.map((p) => [`PRODUCT:${p.id}`, p] as [string, Card])]);
  const name = new Map(users.map((u) => [u.id, u.username]));

  const detail = (r: (typeof rows)[number]) => {
    const side = (s: string) =>
      lines.filter((l) => l.tradeId === r.id && l.side === s).map((l) => ({ kind: l.kind, quantity: l.quantity, ...(card.get(`${l.kind}:${l.refId}`) ?? { id: l.refId, name: l.refId, rarity: "COMMON", imageUrl: null }) }));
    const mine = r.fromUserId === userId;
    return {
      id: r.id, status: r.status, message: r.message, createdAt: r.createdAt, closedAt: r.closedAt,
      direction: mine ? ("out" as const) : ("in" as const),
      partner: name.get(mine ? r.toUserId : r.fromUserId) ?? "?",
      // Du point de vue du joueur : ce qu'il donne et ce qu'il reçoit
      give: mine ? { coins: r.offerCoins, items: side("OFFER") } : { coins: r.requestCoins, items: side("REQUEST") },
      get: mine ? { coins: r.requestCoins, items: side("REQUEST") } : { coins: r.offerCoins, items: side("OFFER") },
    };
  };
  const all = rows.map(detail);
  return {
    incoming: all.filter((t) => t.status === "PENDING" && t.direction === "in"),
    outgoing: all.filter((t) => t.status === "PENDING" && t.direction === "out"),
    history: all.filter((t) => t.status !== "PENDING").slice(0, 20),
  };
}

/** Cartes échangeables d'un joueur (soi-même ou un ami). */
export async function tradeInventory(userId: string, ownerId: string) {
  if (ownerId !== userId && !(await areFriends(db, userId, ownerId))) fail("Tu ne peux voir que l'inventaire de tes amis", 403);
  const ingredients = await db
    .select({ id: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl, quantity: S.userIngredients.quantity })
    .from(S.userIngredients)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.userIngredients.ingredientId))
    .where(and(eq(S.userIngredients.userId, ownerId), gt(S.userIngredients.quantity, 0)))
    .orderBy(asc(S.ingredients.name));
  const products = await db
    .select({ id: S.products.code, name: S.products.name, rarity: S.products.rarity, imageUrl: S.products.imageUrl, quantity: S.userProducts.quantity })
    .from(S.userProducts)
    .innerJoin(S.products, eq(S.products.code, S.userProducts.productCode))
    .where(and(eq(S.userProducts.userId, ownerId), gt(S.userProducts.quantity, 0)))
    .orderBy(asc(S.products.name));
  const [u] = await db.select({ coins: S.users.coins, username: S.users.username }).from(S.users).where(eq(S.users.id, ownerId));
  return { username: u?.username, coins: ownerId === userId ? u?.coins : null, ingredients, products };
}
