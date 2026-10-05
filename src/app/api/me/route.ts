import { authed } from "@/lib/api";
import { getMe } from "@/lib/services";

export const GET = authed(({ userId }) => getMe(userId));
