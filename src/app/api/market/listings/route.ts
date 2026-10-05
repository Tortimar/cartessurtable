import { authed, body, fail, posInt } from "@/lib/api";
import { createListing } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; quantity?: number; unitPrice?: number }>(req);
  if (!b.ingredientId) fail("Ingrédient manquant");
  return createListing(userId, b.ingredientId, posInt(b.quantity, "Quantité"), posInt(b.unitPrice, "Prix"));
});
