import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail } from "./api";
import { CHAT_PAGE_SIZE, MESSAGE_MAX_LENGTH, MESSAGE_MIN_INTERVAL_MS } from "./game";
import { guildChannel, myGuild } from "./guilds";
import { friendIds } from "./social";

const S = schema;
export type ChannelKind = "global" | "guild" | "dm";
const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

/** Canal réel + contrôle d'accès : guilde = membres seulement, messages privés = amis seulement. */
async function resolveChannel(userId: string, kind: unknown, withId?: unknown) {
  if (kind === "global") return { key: "global" };
  if (kind === "guild") {
    const g = await myGuild(userId);
    if (!g) fail("Tu n'es dans aucune guilde", 403);
    return { key: guildChannel(g.id), guild: g };
  }
  if (kind === "dm") {
    if (typeof withId !== "string" || !withId) fail("Destinataire manquant");
    if (!(await friendIds(userId)).has(withId)) fail("Tu ne peux écrire qu'à tes amis", 403);
    return { key: dmChannel(userId, withId) };
  }
  fail("Canal inconnu");
}

async function markRead(userId: string, channel: string) {
  const now = new Date();
  await db.insert(S.chatReads).values({ userId, channel, lastReadAt: now }).onConflictDoUpdate({ target: [S.chatReads.userId, S.chatReads.channel], set: { lastReadAt: now } });
}

/**
 * Messages d'un canal, du plus ancien au plus récent.
 *  - sans curseur : les derniers messages (et le canal est marqué comme lu)
 *  - after : nouveaux messages depuis cet instant (suivi en direct, inclusif : le client dédoublonne)
 *  - before : messages plus anciens (« Messages précédents »)
 */
export async function listMessages(userId: string, opts: { channel: unknown; with?: unknown; after?: string | null; before?: string | null }) {
  const { key } = await resolveChannel(userId, opts.channel, opts.with);
  const after = opts.after ? new Date(opts.after) : null;
  const before = opts.before ? new Date(opts.before) : null;
  const tagOf = sql<string | null>`(select g.tag from ${S.guildMembers} gm join ${S.guilds} g on g.id = gm.guild_id where gm.user_id = ${S.messages.senderId})`;
  const base = db
    .select({ id: S.messages.id, body: S.messages.body, createdAt: S.messages.createdAt, senderId: S.messages.senderId, sender: S.users.username, tag: tagOf })
    .from(S.messages)
    .leftJoin(S.users, eq(S.users.id, S.messages.senderId));
  let rows;
  if (after && !Number.isNaN(after.getTime())) {
    rows = await base.where(and(eq(S.messages.channel, key), gte(S.messages.createdAt, after))).orderBy(asc(S.messages.createdAt), asc(S.messages.id)).limit(200);
  } else {
    const where = before && !Number.isNaN(before.getTime()) ? and(eq(S.messages.channel, key), lt(S.messages.createdAt, before)) : eq(S.messages.channel, key);
    rows = (await base.where(where).orderBy(desc(S.messages.createdAt), desc(S.messages.id)).limit(CHAT_PAGE_SIZE + 1)).reverse();
  }
  const hasMore = !after && rows.length > CHAT_PAGE_SIZE;
  if (hasMore) rows = rows.slice(1);
  if (!before) await markRead(userId, key);
  return {
    messages: rows.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, sender: m.sender, tag: m.tag, system: m.senderId == null, mine: m.senderId === userId })),
    hasMore,
  };
}

export async function sendMessage(userId: string, input: { channel?: unknown; with?: unknown; body?: unknown }) {
  const body = typeof input.body === "string" ? input.body.replace(/\s+$/g, "").replace(/^\s+/g, "") : "";
  if (!body) fail("Message vide");
  if (body.length > MESSAGE_MAX_LENGTH) fail(`Message trop long (${MESSAGE_MAX_LENGTH} caractères maximum)`);
  const { key } = await resolveChannel(userId, input.channel, input.with);
  const [last] = await db.select({ at: S.messages.createdAt }).from(S.messages).where(eq(S.messages.senderId, userId)).orderBy(desc(S.messages.createdAt)).limit(1);
  if (last && Date.now() - last.at.getTime() < MESSAGE_MIN_INTERVAL_MS) fail("Doucement ! Attends une seconde entre deux messages", 429);
  const [m] = await db.insert(S.messages).values({ channel: key, senderId: userId, body }).returning();
  await markRead(userId, key);
  return { id: m.id, createdAt: m.createdAt };
}

/** Non lus par canal (messages des autres postés après la dernière lecture). */
async function unreadByChannel(userId: string, keys: string[]) {
  if (!keys.length) return new Map<string, number>();
  const rows = await db
    .select({ channel: S.messages.channel, n: sql<number>`count(*)` })
    .from(S.messages)
    .leftJoin(S.chatReads, and(eq(S.chatReads.userId, userId), eq(S.chatReads.channel, S.messages.channel)))
    .where(and(inArray(S.messages.channel, keys), sql`${S.messages.createdAt} > coalesce(${S.chatReads.lastReadAt}, 0)`, sql`coalesce(${S.messages.senderId}, '') != ${userId}`))
    .groupBy(S.messages.channel);
  return new Map(rows.map((r) => [r.channel, r.n]));
}

/** Liste des conversations : chat général, guilde, et un fil par ami (dernier message, non lus). */
export async function getConversations(userId: string) {
  const ids = [...(await friendIds(userId))];
  const g = await myGuild(userId);
  const friends = ids.length ? await db.select({ id: S.users.id, username: S.users.username }).from(S.users).where(inArray(S.users.id, ids)) : [];
  const dmKeys = friends.map((f) => dmChannel(userId, f.id));
  const keys = ["global", ...(g ? [guildChannel(g.id)] : []), ...dmKeys];
  const [unread, lasts] = await Promise.all([
    unreadByChannel(userId, keys),
    keys.length
      ? db
          .select({ channel: S.messages.channel, body: S.messages.body, createdAt: S.messages.createdAt, senderId: S.messages.senderId })
          .from(S.messages)
          .where(and(inArray(S.messages.channel, keys), sql`${S.messages.createdAt} = (select max(m2.created_at) from ${S.messages} m2 where m2.channel = ${S.messages.channel})`))
      : [],
  ]);
  const last = new Map(lasts.map((l) => [l.channel, l]));
  const preview = (k: string) => {
    const l = last.get(k);
    return l ? { body: l.body.slice(0, 80), createdAt: l.createdAt, mine: l.senderId === userId } : null;
  };
  return {
    global: { unread: unread.get("global") ?? 0, last: preview("global") },
    guild: g ? { id: g.id, name: g.name, tag: g.tag, unread: unread.get(guildChannel(g.id)) ?? 0, last: preview(guildChannel(g.id)) } : null,
    friends: friends
      .map((f) => ({ id: f.id, username: f.username, unread: unread.get(dmChannel(userId, f.id)) ?? 0, last: preview(dmChannel(userId, f.id)) }))
      .sort((a, b) => (b.last?.createdAt.getTime() ?? 0) - (a.last?.createdAt.getTime() ?? 0) || a.username.localeCompare(b.username)),
  };
}

/** Pastille du menu : messages privés et guilde non lus (le chat général n'en a pas, il bouge trop). */
export async function unreadMessageCount(userId: string) {
  const ids = [...(await friendIds(userId))];
  const g = await myGuild(userId);
  const keys = [...(g ? [guildChannel(g.id)] : []), ...ids.map((f) => dmChannel(userId, f))];
  const unread = await unreadByChannel(userId, keys);
  return [...unread.values()].reduce((a, b) => a + b, 0);
}

