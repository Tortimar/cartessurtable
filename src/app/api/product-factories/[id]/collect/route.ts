import { authed } from "@/lib/api";
import { collectProductFactory } from "@/lib/services";

export const POST = authed<{ id: string }>(({ userId, params }) => collectProductFactory(userId, params.id));
