import { authed } from "@/lib/api";
import { getBankOffers } from "@/lib/bank";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId }) => getBankOffers(userId));
