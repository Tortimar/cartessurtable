import { authed } from "@/lib/api";
import { getMarket } from "@/lib/services";
import { listRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ userId, req }) => {
  const u = new URL(req.url);
  const opts = { q: u.searchParams.get("q") ?? undefined, rarity: u.searchParams.get("rarity") ?? undefined };
  const [market, requests] = await Promise.all([getMarket(userId, opts), listRequests(userId, opts)]);
  return { ...market, ...requests };
});
