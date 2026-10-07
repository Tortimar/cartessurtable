import { authed } from "@/lib/api";
import { getGuild } from "@/lib/guilds";

export const dynamic = "force-dynamic";
export const GET = authed<{ id: string }>(({ userId, params }) => getGuild(userId, params.id));
