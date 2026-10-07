import { authed } from "@/lib/api";
import { getChefQuests } from "@/lib/chef";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => getChefQuests(userId));
