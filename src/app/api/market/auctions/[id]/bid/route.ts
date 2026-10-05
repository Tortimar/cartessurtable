import { authed, body, posInt } from "@/lib/api";
import { placeBid } from "@/lib/services";

export const POST = authed<{ id: string }>(async ({ userId, req, params }) => {
  const b = await body<{ amount?: number }>(req);
  return placeBid(userId, params.id, posInt(b.amount, "Montant"));
});
