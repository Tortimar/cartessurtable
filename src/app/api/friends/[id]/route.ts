import { authed } from "@/lib/api";
import { removeFriendship } from "@/lib/social";

export const DELETE = authed<{ id: string }>(({ userId, params }) => removeFriendship(userId, params.id));
