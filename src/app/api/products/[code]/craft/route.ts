import { authed, body, posInt } from "@/lib/api";
import { craftProduct } from "@/lib/services";

export const POST = authed<{ code: string }>(async ({ userId, req, params }) => {
  const b = await body<{ quantity?: number }>(req).catch(() => ({ quantity: 1 }));
  return craftProduct(userId, params.code, posInt(b.quantity ?? 1, "Quantité", 100));
});
