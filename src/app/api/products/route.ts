import { authed } from "@/lib/api";
import { getProducts } from "@/lib/services";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => {
  const u = new URL(req.url);
  const page = Math.max(1, parseInt(u.searchParams.get("page") ?? "1", 10) || 1);
  return getProducts(userId, { q: u.searchParams.get("q") ?? undefined, filter: u.searchParams.get("filter") ?? undefined, page });
});
