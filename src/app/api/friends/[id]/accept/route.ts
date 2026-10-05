import { authed } from "@/lib/api";
import { acceptFriendRequest } from "@/lib/social";

export const POST = authed<{ id: string }>(({ userId, params }) => acceptFriendRequest(userId, params.id));
