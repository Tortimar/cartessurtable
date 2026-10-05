import { authed, body, fail, posInt } from "@/lib/api";
import { quickSell } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; quantity?: number }>(req);
  if (!b.ingredientId) fail("Ingrédient manquant");
  return quickSell(userId, b.ingredientId, posInt(b.quantity, "Quantité"));
});
