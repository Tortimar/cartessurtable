import { authed, body, fail } from "@/lib/api";
import { listTrades, normalizeSide, proposeTrade } from "@/lib/trades";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => listTrades(userId));
export const POST = authed(async ({ userId, req }) => {
  const b = await body<{ toUserId?: string; offer?: unknown; request?: unknown; message?: string }>(req);
  if (typeof b.toUserId !== "string") fail("Destinataire manquant");
  return proposeTrade(userId, b.toUserId, normalizeSide(b.offer, "ton offre"), normalizeSide(b.request, "ta demande"), typeof b.message === "string" ? b.message : undefined);
});
