import { authed, body } from "@/lib/api";
import { listMessages, sendMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const GET = authed(({ userId, req }) => {
  const u = new URL(req.url).searchParams;
  return listMessages(userId, { channel: u.get("channel"), with: u.get("with") ?? undefined, after: u.get("after"), before: u.get("before") });
});
export const POST = authed(async ({ userId, req }) => sendMessage(userId, await body(req)));
