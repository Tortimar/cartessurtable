import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await getUserId()) ? "/boosters" : "/login");
}
