import { authed, body, posInt } from "@/lib/api";
import { BOOSTER_MAX } from "@/lib/game";
import { openBoosters } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const { count = 1 } = await body<{ count?: number }>(req);
  return openBoosters(userId, posInt(count, "Nombre de boosters", BOOSTER_MAX));
});
