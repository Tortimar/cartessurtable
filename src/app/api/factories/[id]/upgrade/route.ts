import { authed } from "@/lib/api";
import { upgradeFactory } from "@/lib/services";

export const POST = authed<{ id: string }>(({ userId, params }) => upgradeFactory(userId, params.id));
