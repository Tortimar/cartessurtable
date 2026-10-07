import { authed, body, fail } from "@/lib/api";
import { kickMember } from "@/lib/guilds";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ userId?: string }>(req);
  if (!b.userId) fail("Joueur manquant");
  return kickMember(userId, b.userId);
});
