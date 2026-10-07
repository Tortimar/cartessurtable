import { authed, body, fail, posInt } from "@/lib/api";
import { createRequest } from "@/lib/requests";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; quantity?: number; unitPrice?: number }>(req);
  if (!b.ingredientId) fail("Choisis l'ingrédient recherché");
  return createRequest(userId, b.ingredientId, posInt(b.quantity, "Quantité", 100), posInt(b.unitPrice, "Prix", 100_000));
});
