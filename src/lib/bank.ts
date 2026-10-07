import "server-only";
import { asc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { BANK_MAX_DISCOUNT, BANK_OFFER_COUNT, BANK_PRODUCT_PRICE, BANK_ROTATION_MS, bankPrice } from "./game";
import { addProduct, takeCoins } from "./inventory";

const S = schema;
const currentHour = (now = Date.now()) => Math.floor(now / BANK_ROTATION_MS);

/** Crée les offres de l'heure si personne ne les a encore demandées (sans risque si deux joueurs arrivent en même temps). */
async function ensureOffers(hour: number) {
  const existing = await db.select({ slot: S.bankOffers.slot }).from(S.bankOffers).where(eq(S.bankOffers.hour, hour));
  if (existing.length >= BANK_OFFER_COUNT) return;
  const picks = await db.select({ code: S.products.code }).from(S.products).orderBy(sql`random()`).limit(BANK_OFFER_COUNT);
  if (picks.length === 0) return;
  const taken = new Set(existing.map((e) => e.slot));
  const rows = picks
    .map((p, slot) => {
      const discount = Math.floor(Math.random() * (BANK_MAX_DISCOUNT + 1));
      return { hour, slot, productCode: p.code, discount, price: bankPrice(discount) };
    })
    .filter((r) => !taken.has(r.slot));
  if (rows.length) await db.insert(S.bankOffers).values(rows).onConflictDoNothing();
  await pruneBankOffers(); // une fois par heure, au renouvellement
}

export async function getBankOffers(userId: string) {
  const now = Date.now();
  const hour = currentHour(now);
  await ensureOffers(hour);
  const offers = await db
    .select({
      id: S.bankOffers.id, slot: S.bankOffers.slot, discount: S.bankOffers.discount, price: S.bankOffers.price,
      code: S.products.code, name: S.products.name, brand: S.products.brand, rarity: S.products.rarity, imageUrl: S.products.imageUrl,
      owned: sql<number>`coalesce((select quantity from ${S.userProducts} up where up.product_code = ${S.products.code} and up.user_id = ${userId}), 0)`,
      bought: sql<number>`exists (select 1 from ${S.bankPurchases} bp where bp.offer_id = ${S.bankOffers.id} and bp.user_id = ${userId})`,
    })
    .from(S.bankOffers)
    .innerJoin(S.products, eq(S.products.code, S.bankOffers.productCode))
    .where(eq(S.bankOffers.hour, hour))
    .orderBy(asc(S.bankOffers.slot));
  return {
    offers: offers.map((o) => ({ ...o, bought: !!o.bought })),
    basePrice: BANK_PRODUCT_PRICE,
    renewsInMs: (hour + 1) * BANK_ROTATION_MS - now,
  };
}

export async function buyBankOffer(userId: string, offerId: string) {
  return db.transaction(async (tx) => {
    const [offer] = await tx
      .select({ id: S.bankOffers.id, hour: S.bankOffers.hour, price: S.bankOffers.price, productCode: S.bankOffers.productCode, name: S.products.name })
      .from(S.bankOffers)
      .innerJoin(S.products, eq(S.products.code, S.bankOffers.productCode))
      .where(eq(S.bankOffers.id, offerId));
    if (!offer) fail("Offre introuvable", 404);
    if (offer.hour !== currentHour()) fail("Cette offre a expiré : de nouvelles offres sont arrivées", 409);
    // Une seule fois par joueur : l'index unique bloque aussi deux clics simultanés
    const done = await tx.insert(S.bankPurchases).values({ offerId, userId }).onConflictDoNothing().returning({ id: S.bankPurchases.id });
    if (done.length === 0) fail("Tu as déjà acheté cette offre", 409);
    await takeCoins(tx, userId, offer.price);
    await addProduct(tx, userId, offer.productCode, 1);
    return { name: offer.name, price: offer.price };
  });
}

/** Ménage : les offres de plus de deux jours (et leurs achats) ne servent plus. */
export async function pruneBankOffers() {
  await db.delete(S.bankOffers).where(lt(S.bankOffers.hour, currentHour() - 48));
}
