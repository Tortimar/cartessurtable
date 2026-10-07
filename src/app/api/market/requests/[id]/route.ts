import { authed, body, posInt } from "@/lib/api";
import { cancelRequest, fulfillRequest } from "@/lib/requests";

type P = { id: string };
/** Livrer des cartes pour cette demande */
export const POST = authed<P>(async ({ userId, req, params }) => {
  const b = await body<{ quantity?: number }>(req);
  return fulfillRequest(userId, params.id, posInt(b.quantity ?? 1, "Quantité", 100));
});
/** Annuler sa demande */
export const DELETE = authed<P>(({ userId, params }) => cancelRequest(userId, params.id));
