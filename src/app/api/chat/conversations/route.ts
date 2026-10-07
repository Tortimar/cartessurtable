import { authed } from "@/lib/api";
import { getConversations } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => getConversations(userId));
