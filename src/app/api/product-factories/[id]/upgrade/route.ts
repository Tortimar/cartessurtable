import { authed } from "@/lib/api";
import { upgradeProductFactory } from "@/lib/services";

export const POST = authed<{ id: string }>(({ userId, params }) => upgradeProductFactory(userId, params.id));
