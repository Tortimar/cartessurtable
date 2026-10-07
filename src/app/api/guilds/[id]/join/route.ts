import { authed } from "@/lib/api";
import { joinGuild } from "@/lib/guilds";

export const POST = authed<{ id: string }>(({ userId, params }) => joinGuild(userId, params.id));
