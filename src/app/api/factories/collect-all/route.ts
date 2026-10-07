import { authed } from "@/lib/api";
import { collectAll } from "@/lib/services";

/** Récolter toutes les usines d'un coup */
export const POST = authed(({ userId }) => collectAll(userId));
