import { authed } from "@/lib/api";
import { leaveGuild } from "@/lib/guilds";

export const POST = authed(({ userId }) => leaveGuild(userId));
