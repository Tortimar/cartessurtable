import { authed } from "@/lib/api";
import { acceptTrade } from "@/lib/trades";

export const POST = authed<{ id: string }>(({ userId, params }) => acceptTrade(userId, params.id));
