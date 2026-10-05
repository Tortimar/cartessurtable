import { authed } from "@/lib/api";
import { searchUsers } from "@/lib/social";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => searchUsers(userId, new URL(req.url).searchParams.get("q") ?? ""));
