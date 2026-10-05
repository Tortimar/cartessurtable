import { authed, body, fail, posInt } from "@/lib/api";
import { createAuction } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; quantity?: number; startPrice?: number; durationMin?: number }>(req);
  if (!b.ingredientId) fail("Ingrédient manquant");
  return createAuction(userId, b.ingredientId, posInt(b.quantity, "Quantité"), posInt(b.startPrice, "Mise de départ"), posInt(b.durationMin, "Durée", 10_000));
});
