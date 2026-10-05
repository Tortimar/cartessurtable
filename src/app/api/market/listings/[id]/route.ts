import { authed } from "@/lib/api";
import { buyListing, cancelListing } from "@/lib/services";

type P = { id: string };
export const POST = authed<P>(({ userId, params }) => buyListing(userId, params.id));
export const DELETE = authed<P>(({ userId, params }) => cancelListing(userId, params.id));
