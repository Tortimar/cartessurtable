import "server-only";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { factoryYield, productFactoryYield, type Rarity } from "./game";

const S = schema;

/* ───────────────────────────── Scores ───────────────────────────── */

type ScoreInfo = { score: number; factories: number; best: { name: string; level: number; yieldPerHour: number } | null };

/** Score de rendement de chaque joueur = somme des rendements de ses usines. */
async function allScores() {
  const rows = await db
    .select({ userId: S.factories.userId, intervalSec: S.factories.intervalSec, level: S.factories.level, rarity: S.ingredients.rarity, name: S.ingredients.name })
    .from(S.factories)
    .innerJoin(S.ingredients, eq(S.ingredients.id, S.factories.ingredientId));
  const map = new Map<string, ScoreInfo>();
  for (const r of rows) {
    const y = factoryYield(r.intervalSec, r.level, r.rarity as Rarity);
    const e = map.get(r.userId) ?? { score: 0, factories: 0, best: null };
    e.score += y;
    e.factories += 1;
    if (!e.best || y > e.best.yieldPerHour) e.best = { name: r.name, level: r.level, yieldPerHour: y };
    map.set(r.userId, e);
  }
  const prows = await db
    .select({ userId: S.productFactories.userId, intervalSec: S.productFactories.intervalSec, level: S.productFactories.level, points: S.productFactories.points, name: S.products.name })
    .from(S.productFactories)
    .innerJoin(S.products, eq(S.products.code, S.productFactories.productCode));
  for (const r of prows) {
    const y = productFactoryYield(r.intervalSec, r.level, r.points);
    const e = map.get(r.userId) ?? { score: 0, factories: 0, best: null };
    e.score += y;
    e.factories += 1;
    if (!e.best || y > e.best.yieldPerHour) e.best = { name: r.name, level: r.level, yieldPerHour: y };
    map.set(r.userId, e);
  }
  for (const e of map.values()) e.score = Math.round(e.score * 10) / 10;
  return map;
}

const EMPTY: ScoreInfo = { score: 0, factories: 0, best: null };

export async function friendIds(userId: string) {
  const rows = await db
    .select({ a: S.friendships.requesterId, b: S.friendships.addresseeId })
    .from(S.friendships)
    .where(and(eq(S.friendships.status, "ACCEPTED"), or(eq(S.friendships.requesterId, userId), eq(S.friendships.addresseeId, userId))));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/* ───────────────────────────── Classement ───────────────────────────── */

const LEADERBOARD_SIZE = 100;

export async function getLeaderboard(userId: string, scope: "all" | "friends") {
  const [scores, friends, users] = await Promise.all([
    allScores(),
    friendIds(userId),
    db.select({ id: S.users.id, username: S.users.username }).from(S.users),
  ]);
  const pool = scope === "friends" ? users.filter((u) => u.id === userId || friends.has(u.id)) : users;
  const sorted = pool
    .map((u) => ({ ...u, ...(scores.get(u.id) ?? EMPTY) }))
    .sort((a, b) => b.score - a.score || b.factories - a.factories || a.username.localeCompare(b.username));

  // Rang « sportif » : les ex æquo partagent la même place (1, 2, 2, 4…)
  let rank = 0;
  const ranked = sorted.map((e, i) => {
    if (i === 0 || e.score !== sorted[i - 1].score) rank = i + 1;
    return { rank, id: e.id, username: e.username, score: e.score, factories: e.factories, best: e.best, me: e.id === userId, friend: friends.has(e.id) };
  });

  return {
    scope,
    total: ranked.length,
    entries: ranked.slice(0, LEADERBOARD_SIZE),
    me: ranked.find((e) => e.me) ?? null,
  };
}

/* ───────────────────────────── Amis ───────────────────────────── */

export async function getFriends(userId: string) {
  const other = sql<string>`case when ${S.friendships.requesterId} = ${userId} then ${S.friendships.addresseeId} else ${S.friendships.requesterId} end`;
  const rows = await db
    .select({ id: S.friendships.id, status: S.friendships.status, requesterId: S.friendships.requesterId, createdAt: S.friendships.createdAt, acceptedAt: S.friendships.acceptedAt, otherId: other, username: S.users.username })
    .from(S.friendships)
    .innerJoin(S.users, eq(S.users.id, other))
    .where(or(eq(S.friendships.requesterId, userId), eq(S.friendships.addresseeId, userId)))
    .orderBy(asc(S.users.username));
  const scores = await allScores();

  const friends = rows
    .filter((r) => r.status === "ACCEPTED")
    .map((r) => ({ friendshipId: r.id, id: r.otherId, username: r.username, since: r.acceptedAt, ...(scores.get(r.otherId) ?? EMPTY) }))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  const incoming = rows.filter((r) => r.status === "PENDING" && r.requesterId !== userId).map((r) => ({ friendshipId: r.id, id: r.otherId, username: r.username, createdAt: r.createdAt, ...(scores.get(r.otherId) ?? EMPTY) }));
  const outgoing = rows.filter((r) => r.status === "PENDING" && r.requesterId === userId).map((r) => ({ friendshipId: r.id, id: r.otherId, username: r.username, createdAt: r.createdAt }));
  return { friends, incoming, outgoing };
}

export async function pendingRequestCount(userId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(S.friendships)
    .where(and(eq(S.friendships.addresseeId, userId), eq(S.friendships.status, "PENDING")));
  return n;
}

/** Recherche de joueurs par pseudo, avec l'état de la relation pour chacun. */
export async function searchUsers(userId: string, q: string) {
  const query = q.trim();
  if (query.length < 2) return { users: [] };
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const found = await db
    .select({ id: S.users.id, username: S.users.username })
    .from(S.users)
    .where(and(ne(S.users.id, userId), sql`${S.users.username} like ${`%${escaped}%`} escape '\\'`))
    .orderBy(asc(sql`length(${S.users.username})`), asc(S.users.username))
    .limit(10);
  const links = await db
    .select()
    .from(S.friendships)
    .where(or(eq(S.friendships.requesterId, userId), eq(S.friendships.addresseeId, userId)));
  const scores = await allScores();
  return {
    users: found.map((u) => {
      const l = links.find((x) => x.requesterId === u.id || x.addresseeId === u.id);
      const relation = !l ? "none" : l.status === "ACCEPTED" ? "friend" : l.requesterId === userId ? "outgoing" : "incoming";
      return { ...u, relation, friendshipId: l?.id ?? null, score: scores.get(u.id)?.score ?? 0 };
    }),
  };
}

export async function sendFriendRequest(userId: string, username: string) {
  const name = username.trim();
  if (!name) fail("Pseudo manquant");
  const [target] = await db.select({ id: S.users.id, username: S.users.username }).from(S.users).where(eq(S.users.username, name));
  if (!target) fail(`Aucun joueur « ${name} »`, 404);
  if (target.id === userId) fail("Tu ne peux pas t'ajouter toi-même");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(S.friendships)
      .where(or(
        and(eq(S.friendships.requesterId, userId), eq(S.friendships.addresseeId, target.id)),
        and(eq(S.friendships.requesterId, target.id), eq(S.friendships.addresseeId, userId)),
      ));
    if (existing?.status === "ACCEPTED") fail(`${target.username} est déjà ton ami`);
    if (existing && existing.requesterId === userId) fail(`Demande déjà envoyée à ${target.username}`);
    if (existing) {
      // L'autre joueur nous avait déjà demandé : on accepte directement
      await tx.update(S.friendships).set({ status: "ACCEPTED", acceptedAt: new Date() }).where(eq(S.friendships.id, existing.id));
      return { status: "ACCEPTED" as const, username: target.username };
    }
    await tx.insert(S.friendships).values({ requesterId: userId, addresseeId: target.id });
    return { status: "PENDING" as const, username: target.username };
  });
}

export async function acceptFriendRequest(userId: string, friendshipId: string) {
  const rows = await db
    .update(S.friendships)
    .set({ status: "ACCEPTED", acceptedAt: new Date() })
    .where(and(eq(S.friendships.id, friendshipId), eq(S.friendships.addresseeId, userId), eq(S.friendships.status, "PENDING")))
    .returning({ id: S.friendships.id });
  if (rows.length === 0) fail("Demande introuvable", 404);
}

/** Refuser une demande reçue, annuler une demande envoyée ou retirer un ami. */
export async function removeFriendship(userId: string, friendshipId: string) {
  const rows = await db
    .delete(S.friendships)
    .where(and(eq(S.friendships.id, friendshipId), or(eq(S.friendships.requesterId, userId), eq(S.friendships.addresseeId, userId))))
    .returning({ id: S.friendships.id });
  if (rows.length === 0) fail("Relation introuvable", 404);
}

