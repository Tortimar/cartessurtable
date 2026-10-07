import { authed, body, fail, posInt } from "@/lib/api";
import { quickSell, quickSellProduct } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; productCode?: string; quantity?: number }>(req);
  const quantity = posInt(b.quantity, "Quantité");
  if (b.productCode) return quickSellProduct(userId, b.productCode, quantity);
  if (!b.ingredientId) fail("Ingrédient manquant");
  return quickSell(userId, b.ingredientId, quantity);
});
