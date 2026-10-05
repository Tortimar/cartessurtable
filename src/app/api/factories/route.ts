import { authed, body, fail, posInt } from "@/lib/api";
import { buildFactory, getFactories } from "@/lib/services";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => getFactories(userId));
export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ ingredientId?: string; products?: { code?: string; quantity?: number }[] }>(req);
  if (!b.ingredientId) fail("Ingrédient manquant");
  if (!Array.isArray(b.products) || b.products.length === 0) fail("Sélectionne les produits à utiliser");
  const selection = b.products.map((p) => {
    if (typeof p?.code !== "string") fail("Produit invalide");
    return { code: p.code, quantity: posInt(p.quantity, "Quantité", 100) };
  });
  return buildFactory(userId, b.ingredientId, selection);
});
