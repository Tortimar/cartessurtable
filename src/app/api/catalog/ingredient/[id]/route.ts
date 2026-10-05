import { authed } from "@/lib/api";
import { getIngredientCard } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const GET = authed<{ id: string }>(({ userId, params }) => getIngredientCard(userId, decodeURIComponent(params.id)));
