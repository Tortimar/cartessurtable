import { authed } from "@/lib/api";
import { deliverToChef } from "@/lib/chef";

/** Livrer l'ingrédient demandé par cette commande */
export const POST = authed<{ id: string }>(({ userId, params }) => deliverToChef(userId, params.id));
