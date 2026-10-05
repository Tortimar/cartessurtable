import { authed, body, fail } from "@/lib/api";
import { buildProductFactory } from "@/lib/services";

export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ productCode?: string; factoryIds?: unknown }>(req);
  if (typeof b.productCode !== "string") fail("Produit manquant");
  if (!Array.isArray(b.factoryIds) || b.factoryIds.length === 0 || b.factoryIds.length > 20 || b.factoryIds.some((x) => typeof x !== "string")) fail("Sélection d'usines invalide");
  return buildProductFactory(userId, b.productCode, b.factoryIds as string[]);
});
