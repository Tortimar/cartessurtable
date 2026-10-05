import { authed, body, fail } from "@/lib/api";
import { getFriends, sendFriendRequest } from "@/lib/social";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => getFriends(userId));
export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ username?: string }>(req);
  if (typeof b.username !== "string") fail("Pseudo manquant");
  return sendFriendRequest(userId, b.username);
});
