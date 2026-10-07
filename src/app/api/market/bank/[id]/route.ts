import { authed } from "@/lib/api";
import { buyBankOffer } from "@/lib/bank";

export const POST = authed<{ id: string }>(({ userId, params }) => buyBankOffer(userId, params.id));
