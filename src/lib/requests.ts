import "server-only";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { MAX_OPEN_REQUESTS, RARITIES } from "./game";
import { addCoins, addIngredient, takeCoins, takeIngredient } from "./inventory";

const S = schema;

/** Nouvelle demande : le total (quantité × prix) est bloqué jusqu'à la livraison ou l'annulation. */
export async function createRequest(userId: string, ingredientId: string, quantity: number, unitPrice: number) {
  return db.transaction(async (tx) => {
    const [ing] = await tx.select({ id: S.ingredients.id }).from(S.ingredients).where(eq(S.ingredients.id, ingredientId));
    if (!ing) fail("Ingrédient inconnu", 404);
    const [{ open }] = await tx
      .select({ open: sql<number>`count(*)` })
      .from(S.buyRequests)
      .where(and(eq(S.buyRequests.requesterId, userId), eq(S.buyRequests.status, "OPEN")));
    if (open >= MAX_OPEN_REQUESTS) fail(`Tu as déjà ${MAX_OPEN_REQUESTS} demandes en cours : annule-en une ou attends qu'elles soient remplies`);
    await takeCoins(tx, userId, quantity * unitPrice);
    const [r] = await tx.insert(S.buyRequests).values({ requesterId: userId, ingredientId, quantity, unitPrice }).returning();
    // Garde-fou si deux demandes partent au même instant
    const [{ after }] = await tx
      .select({ after: sql<number>`count(*)` })
      .from(S.buyRequests)
      .where(and(eq(S.buyRequests.requesterId, userId), eq(S.buyRequests.status, "OPEN")));
    if (after > MAX_OPEN_REQUESTS) fail(`Maximum ${MAX_OPEN_REQUESTS} demandes en cours`);
    return r;
  });
}

/** Un autre joueur livre tout ou partie de la demande : ses cartes contre les pièces bloquées. */
export async function fulfillRequest(userId: string, requestId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(S.buyRequests).where(eq(S.buyRequests.id, requestId));
    if (!r || r.status !== "OPEN") fail("Cette demande n'est plus d'actualité", 404);
    if (r.requesterId === userId) fail("Tu ne peux pas répondre à ta propre demande");
    const remaining = r.quantity - r.filled;
    if (quantity > remaining) fail(`Il ne reste que ${remaining} carte${remaining > 1 ? "s" : ""} à livrer`);
    // Verrou optimiste : personne d'autre n'a livré entre-temps
    const done = r.filled + quantity === r.quantity;
    const updated = await tx
      .update(S.buyRequests)
      .set({ filled: r.filled + quantity, ...(done ? { status: "FILLED", closedAt: new Date() } : {}) })
      .where(and(eq(S.buyRequests.id, requestId), eq(S.buyRequests.status, "OPEN"), eq(S.buyRequests.filled, r.filled)))
      .returning({ id: S.buyRequests.id });
    if (updated.length === 0) fail("Quelqu'un vient de livrer cette demande, actualise", 409);
    await takeIngredient(tx, userId, r.ingredientId, quantity);
    await addIngredient(tx, r.requesterId, r.ingredientId, quantity);
    const earned = quantity * r.unitPrice;
    await addCoins(tx, userId, earned); // les pièces du demandeur sont déjà bloquées
    return { earned, quantity, done };
  });
}

/** Annulation par son auteur : les pièces non dépensées lui reviennent. */
export async function cancelRequest(userId: string, requestId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(S.buyRequests).where(eq(S.buyRequests.id, requestId));
    if (!r || r.requesterId !== userId) fail("Demande introuvable", 404);
    const closed = await tx
      .update(S.buyRequests)
      .set({ status: "CANCELLED", closedAt: new Date() })
      .where(and(eq(S.buyRequests.id, requestId), eq(S.buyRequests.status, "OPEN"), eq(S.buyRequests.filled, r.filled)))
      .returning({ id: S.buyRequests.id });
    if (closed.length === 0) fail("Cette demande vient de changer, actualise", 409);
    const refund = (r.quantity - r.filled) * r.unitPrice;
    await addCoins(tx, userId, refund);
    return { refund };
  });
}

/** Demandes ouvertes (filtres du marché) avec le nombre de cartes que le joueur peut livrer. */
export async function listRequests(userId: string, opts: { q?: string; rarity?: string }) {
  const where = [eq(S.buyRequests.status, "OPEN")];
  if (opts.q) where.push(like(S.ingredients.name, `%${opts.q}%`));
  if (opts.rarity && (RARITIES as readonly string[]).includes(opts.rarity)) where.push(eq(S.ingredients.rarity, opts.rarity));
  const rows = await db
    .select({
      id: S.buyRequests.id, ingredientId: S.buyRequests.ingredientId, quantity: S.buyRequests.quantity, filled: S.buyRequests.filled,
      unitPrice: S.buyRequests.unitPrice, createdAt: S.buyRequests.createdAt, requester: S.users.username,
      mine: sql<number>`${S.buyRequests.requesterId} = ${userId}`,
      ingredientName: S.ingredients.name, rarity: S.ingredients.rarity, baseValue: S.ingredients.baseValue, imageUrl: S.ingredients.imageUrl,
      have: sql<number>`coalesce((select quantity from ${S.userIngredients} ui where ui.ingredient_id = ${S.buyRequests.ingredientId} and ui.user_id = ${userId}), 0)`,
    })
    .from(S.buyRequests)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.buyRequests.ingredientId))
    .innerJoin(S.users, eq(S.users.id, S.buyRequests.requesterId))
    .where(and(...where))
    .orderBy(desc(sql`${S.buyRequests.requesterId} = ${userId}`), desc(S.buyRequests.unitPrice), desc(S.buyRequests.createdAt))
    .limit(100);
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)` })
    .from(S.buyRequests)
    .where(and(eq(S.buyRequests.requesterId, userId), eq(S.buyRequests.status, "OPEN")));
  return { requests: rows.map((r) => ({ ...r, mine: !!r.mine })), myOpen: open, maxOpen: MAX_OPEN_REQUESTS };
}
