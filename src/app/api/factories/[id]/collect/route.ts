import { authed } from "@/lib/api";
import { collectFactory } from "@/lib/services";

export const POST = authed<{ id: string }>(({ userId, params }) => collectFactory(userId, params.id));
