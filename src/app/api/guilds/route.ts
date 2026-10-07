import { authed, body } from "@/lib/api";
import { createGuild, listGuilds, updateGuild } from "@/lib/guilds";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => listGuilds(userId));
export const POST = authed(async ({ userId, req }) => createGuild(userId, await body(req)));
/** Le chef modifie la description de sa guilde */
export const PATCH = authed(async ({ userId, req }) => updateGuild(userId, await body(req)));
