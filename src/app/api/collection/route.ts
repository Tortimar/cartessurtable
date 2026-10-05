import { authed } from "@/lib/api";
import { getCollection } from "@/lib/services";

export const GET = authed(({ userId }) => getCollection(userId));
