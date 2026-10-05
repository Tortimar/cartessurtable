import { authed } from "@/lib/api";
import { tradeInventory } from "@/lib/trades";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => tradeInventory(userId, new URL(req.url).searchParams.get("user") || userId));
