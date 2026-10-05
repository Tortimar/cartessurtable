import { authed } from "@/lib/api";
import { getLeaderboard } from "@/lib/social";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => {
  const scope = new URL(req.url).searchParams.get("scope") === "friends" ? "friends" : "all";
  return getLeaderboard(userId, scope);
});
