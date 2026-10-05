import { authed } from "@/lib/api";
import { getMarket } from "@/lib/services";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => {
  const u = new URL(req.url);
  return getMarket(userId, { q: u.searchParams.get("q") ?? undefined, rarity: u.searchParams.get("rarity") ?? undefined });
});
