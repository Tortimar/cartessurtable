import { authed } from "@/lib/api";
import { closeTrade } from "@/lib/trades";

// Refuser (destinataire) ou annuler (expéditeur)
export const DELETE = authed<{ id: string }>(({ userId, params }) => closeTrade(userId, params.id));
