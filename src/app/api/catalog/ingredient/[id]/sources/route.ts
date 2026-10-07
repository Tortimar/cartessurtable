import { authed } from "@/lib/api";
import { getIngredientSources } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const GET = authed<{ id: string }>(({ userId, params }) => getIngredientSources(userId, decodeURIComponent(params.id)));
