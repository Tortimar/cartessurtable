import "server-only";
import { asc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { CHEF_DAILY_COUNT, CHEF_REWARD, CHEF_TIMEZONE } from "./game";
import { addCoins, takeIngredient } from "./inventory";

const S = schema;

/** Date du jour à Paris (AAAA-MM-JJ) et durée jusqu'au prochain minuit parisien. */
export function chefDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: CHEF_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  return { day, renewsInMs: Math.max(1000, 86_400_000 - elapsed) };
}

/** Crée la commande du jour à la première visite (sans doublon si plusieurs joueurs arrivent en même temps). */
async function ensureQuests(day: string) {
  const existing = await db.select({ slot: S.chefQuests.slot }).from(S.chefQuests).where(eq(S.chefQuests.day, day));
  if (existing.length >= CHEF_DAILY_COUNT) return;
  const picks = await db.select({ id: S.ingredients.id }).from(S.ingredients).orderBy(sql`random()`).limit(CHEF_DAILY_COUNT);
  const taken = new Set(existing.map((e) => e.slot));
  const rows = picks.map((p, slot) => ({ day, slot, ingredientId: p.id, reward: CHEF_REWARD })).filter((r) => !taken.has(r.slot));
  if (rows.length) await db.insert(S.chefQuests).values(rows).onConflictDoNothing();
  // Ménage : les commandes de plus d'une semaine ne servent plus
  const old = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  await db.delete(S.chefQuests).where(lt(S.chefQuests.day, old));
}

export async function getChefQuests(userId: string) {
  const { day, renewsInMs } = chefDay();
  await ensureQuests(day);
  const quests = await db
    .select({
      id: S.chefQuests.id, slot: S.chefQuests.slot, reward: S.chefQuests.reward,
      ingredientId: S.ingredients.id, name: S.ingredients.name, rarity: S.ingredients.rarity, imageUrl: S.ingredients.imageUrl,
      have: sql<number>`coalesce((select quantity from ${S.userIngredients} ui where ui.ingredient_id = ${S.chefQuests.ingredientId} and ui.user_id = ${userId}), 0)`,
      delivered: sql<number>`exists (select 1 from ${S.chefDeliveries} d where d.quest_id = ${S.chefQuests.id} and d.user_id = ${userId})`,
    })
    .from(S.chefQuests)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.chefQuests.ingredientId))
    .where(eq(S.chefQuests.day, day))
    .orderBy(asc(S.chefQuests.slot));
  const list = quests.map((q) => ({ ...q, delivered: !!q.delivered }));
  return { day, renewsInMs, quests: list, done: list.filter((q) => q.delivered).length, earnedToday: list.filter((q) => q.delivered).reduce((n, q) => n + q.reward, 0) };
}

/** Livrer au Chef une carte de l'ingrédient demandé : il la rachète au prix fixé. */
export async function deliverToChef(userId: string, questId: string) {
  return db.transaction(async (tx) => {
    const [q] = await tx
      .select({ id: S.chefQuests.id, day: S.chefQuests.day, reward: S.chefQuests.reward, ingredientId: S.chefQuests.ingredientId, name: S.ingredients.name })
      .from(S.chefQuests)
      .innerJoin(S.ingredients, eq(S.ingredients.id, S.chefQuests.ingredientId))
      .where(eq(S.chefQuests.id, questId));
    if (!q) fail("Commande introuvable", 404);
    if (q.day !== chefDay().day) fail("Cette commande est terminée : le Chef a une nouvelle liste aujourd'hui", 409);
    const done = await tx.insert(S.chefDeliveries).values({ questId, userId }).onConflictDoNothing().returning({ id: S.chefDeliveries.id });
    if (!done.length) fail(`Tu as déjà livré « ${q.name} » aujourd'hui`, 409);
    await takeIngredient(tx, userId, q.ingredientId, 1);
    await addCoins(tx, userId, q.reward);
    return { earned: q.reward, name: q.name };
  });
}
