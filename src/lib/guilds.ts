import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { fail } from "./api";
import { GUILD_MAX_MEMBERS } from "./game";
import { allScores } from "./social";

const S = schema;
export const guildChannel = (guildId: string) => `guild:${guildId}`;

/** Guilde du joueur (ou null). */
export async function myGuild(userId: string, tx: Tx | typeof db = db) {
  const [g] = await tx
    .select({ id: S.guilds.id, name: S.guilds.name, tag: S.guilds.tag, leaderId: S.guilds.leaderId })
    .from(S.guildMembers)
    .innerJoin(S.guilds, eq(S.guilds.id, S.guildMembers.guildId))
    .where(eq(S.guildMembers.userId, userId));
  return g ?? null;
}

const systemMessage = (tx: Tx, guildId: string, body: string) => tx.insert(S.messages).values({ channel: guildChannel(guildId), senderId: null, body });

/** Toutes les guildes avec leur effectif et leur score (somme des rendements des membres). */
export async function listGuilds(userId: string) {
  const [rows, members, scores, mine] = await Promise.all([
    db.select().from(S.guilds),
    db.select({ guildId: S.guildMembers.guildId, userId: S.guildMembers.userId }).from(S.guildMembers),
    allScores(),
    myGuild(userId),
  ]);
  const guilds = rows
    .map((g) => {
      const m = members.filter((x) => x.guildId === g.id);
      const score = Math.round(m.reduce((n, x) => n + (scores.get(x.userId)?.score ?? 0), 0) * 10) / 10;
      return { id: g.id, name: g.name, tag: g.tag, description: g.description, members: m.length, maxMembers: GUILD_MAX_MEMBERS, score, mine: mine?.id === g.id };
    })
    .sort((a, b) => b.score - a.score || b.members - a.members || a.name.localeCompare(b.name));
  return { guilds: guilds.map((g, i) => ({ ...g, rank: i + 1 })), myGuildId: mine?.id ?? null };
}

/** Fiche d'une guilde : membres et scores. */
export async function getGuild(userId: string, guildId: string) {
  const [g] = await db.select().from(S.guilds).where(eq(S.guilds.id, guildId));
  if (!g) fail("Guilde introuvable", 404);
  const [rows, scores, mine] = await Promise.all([
    db
      .select({ id: S.users.id, username: S.users.username, joinedAt: S.guildMembers.joinedAt })
      .from(S.guildMembers)
      .innerJoin(S.users, eq(S.users.id, S.guildMembers.userId))
      .where(eq(S.guildMembers.guildId, guildId))
      .orderBy(asc(S.guildMembers.joinedAt)),
    allScores(),
    myGuild(userId),
  ]);
  const members = rows
    .map((m) => ({ ...m, leader: m.id === g.leaderId, me: m.id === userId, score: scores.get(m.id)?.score ?? 0 }))
    .sort((a, b) => Number(b.leader) - Number(a.leader) || b.score - a.score);
  return {
    guild: { id: g.id, name: g.name, tag: g.tag, description: g.description, createdAt: g.createdAt, maxMembers: GUILD_MAX_MEMBERS },
    members,
    score: Math.round(members.reduce((n, m) => n + m.score, 0) * 10) / 10,
    isMember: mine?.id === g.id,
    isLeader: g.leaderId === userId,
    inOtherGuild: !!mine && mine.id !== g.id,
  };
}

function cleanName(name: unknown) {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (n.length < 3 || n.length > 30) fail("Le nom de la guilde doit faire entre 3 et 30 caractères");
  return n;
}
function cleanTag(tag: unknown) {
  const t = typeof tag === "string" ? tag.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,4}$/.test(t)) fail("Le blason doit faire 2 à 4 lettres ou chiffres");
  return t;
}
function cleanDescription(d: unknown) {
  const s = typeof d === "string" ? d.trim() : "";
  if (s.length > 200) fail("Description trop longue (200 caractères maximum)");
  return s || null;
}

export async function createGuild(userId: string, input: { name?: unknown; tag?: unknown; description?: unknown }) {
  const name = cleanName(input.name), tag = cleanTag(input.tag), description = cleanDescription(input.description);
  return db.transaction(async (tx) => {
    if (await myGuild(userId, tx)) fail("Quitte d'abord ta guilde actuelle");
    const clash = await tx.select({ name: S.guilds.name, tag: S.guilds.tag }).from(S.guilds).where(sql`lower(${S.guilds.name}) = lower(${name}) or ${S.guilds.tag} = ${tag}`);
    if (clash.length) fail(clash[0].tag === tag ? `Le blason [${tag}] est déjà pris` : "Ce nom de guilde est déjà pris", 409);
    const [g] = await tx.insert(S.guilds).values({ name, tag, description, leaderId: userId }).returning();
    await tx.insert(S.guildMembers).values({ userId, guildId: g.id });
    await systemMessage(tx, g.id, `La guilde ${name} [${tag}] est fondée !`);
    return g;
  });
}

export async function joinGuild(userId: string, guildId: string) {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(S.guilds).where(eq(S.guilds.id, guildId));
    if (!g) fail("Guilde introuvable", 404);
    const current = await myGuild(userId, tx);
    if (current) fail(current.id === guildId ? "Tu fais déjà partie de cette guilde" : "Quitte d'abord ta guilde actuelle");
    // userId est la clé primaire : impossible d'être dans deux guildes, même en cliquant deux fois
    const added = await tx.insert(S.guildMembers).values({ userId, guildId }).onConflictDoNothing().returning({ userId: S.guildMembers.userId });
    if (!added.length) fail("Tu fais déjà partie d'une guilde", 409);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(S.guildMembers).where(eq(S.guildMembers.guildId, guildId));
    if (n > GUILD_MAX_MEMBERS) fail(`Guilde complète (${GUILD_MAX_MEMBERS} membres)`);
    const [u] = await tx.select({ username: S.users.username }).from(S.users).where(eq(S.users.id, userId));
    await systemMessage(tx, guildId, `${u.username} a rejoint la guilde.`);
    return { guildId, name: g.name };
  });
}

/** Départ (ou exclusion) : le chef passe la main au plus ancien membre ; une guilde vide disparaît. */
async function removeMember(tx: Tx, guildId: string, memberId: string, message: string) {
  const del = await tx.delete(S.guildMembers).where(and(eq(S.guildMembers.userId, memberId), eq(S.guildMembers.guildId, guildId))).returning({ userId: S.guildMembers.userId });
  if (!del.length) fail("Ce joueur n'est pas dans la guilde", 404);
  const [g] = await tx.select().from(S.guilds).where(eq(S.guilds.id, guildId));
  const [next] = await tx.select({ userId: S.guildMembers.userId, username: S.users.username }).from(S.guildMembers).innerJoin(S.users, eq(S.users.id, S.guildMembers.userId)).where(eq(S.guildMembers.guildId, guildId)).orderBy(asc(S.guildMembers.joinedAt)).limit(1);
  if (!next) {
    await tx.delete(S.messages).where(eq(S.messages.channel, guildChannel(guildId)));
    await tx.delete(S.chatReads).where(eq(S.chatReads.channel, guildChannel(guildId)));
    await tx.delete(S.guilds).where(eq(S.guilds.id, guildId));
    return { dissolved: true };
  }
  await systemMessage(tx, guildId, message);
  if (g.leaderId === memberId) {
    await tx.update(S.guilds).set({ leaderId: next.userId }).where(eq(S.guilds.id, guildId));
    await systemMessage(tx, guildId, `${next.username} est le nouveau chef de la guilde.`);
  }
  return { dissolved: false };
}

export async function leaveGuild(userId: string) {
  return db.transaction(async (tx) => {
    const g = await myGuild(userId, tx);
    if (!g) fail("Tu n'es dans aucune guilde");
    const [u] = await tx.select({ username: S.users.username }).from(S.users).where(eq(S.users.id, userId));
    await tx.delete(S.chatReads).where(and(eq(S.chatReads.userId, userId), eq(S.chatReads.channel, guildChannel(g.id))));
    return removeMember(tx, g.id, userId, `${u.username} a quitté la guilde.`);
  });
}

export async function kickMember(userId: string, memberId: string) {
  return db.transaction(async (tx) => {
    const g = await myGuild(userId, tx);
    if (!g || g.leaderId !== userId) fail("Seul le chef de la guilde peut exclure un membre", 403);
    if (memberId === userId) fail("Pour partir, quitte la guilde");
    const [u] = await tx.select({ username: S.users.username }).from(S.users).where(eq(S.users.id, memberId));
    if (!u) fail("Joueur introuvable", 404);
    await removeMember(tx, g.id, memberId, `${u.username} a été exclu de la guilde.`);
    return { kicked: u.username };
  });
}

export async function updateGuild(userId: string, input: { description?: unknown }) {
  const g = await myGuild(userId);
  if (!g || g.leaderId !== userId) fail("Seul le chef peut modifier la guilde", 403);
  await db.update(S.guilds).set({ description: cleanDescription(input.description) }).where(eq(S.guilds.id, g.id));
  return { ok: true };
}
