import { authed } from "@/lib/api";
import { getProductCard } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const GET = authed<{ code: string }>(({ userId, params }) => getProductCard(userId, decodeURIComponent(params.code)));
