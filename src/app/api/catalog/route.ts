import { authed } from "@/lib/api";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => {
  const u = new URL(req.url).searchParams;
  const owned = u.get("owned");
  const sort = u.get("sort");
  return getCatalog(userId, {
    type: u.get("type") === "products" ? "products" : "ingredients",
    q: u.get("q") ?? undefined,
    rarity: u.get("rarity") ?? undefined,
    owned: owned === "owned" || owned === "missing" ? owned : "all",
    sort: sort === "name" || sort === "popularity" ? sort : "rarity",
    page: Math.max(1, parseInt(u.get("page") ?? "1", 10) || 1),
  });
});
