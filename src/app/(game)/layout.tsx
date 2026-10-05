import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { GameProvider, Nav } from "@/components/ui";
import { PageDecor } from "@/components/decor";

export const dynamic = "force-dynamic";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  if (!(await getUserId())) redirect("/login");
  return (
    <GameProvider>
      <Nav />
      <main className="container"><PageDecor />{children}</main>
    </GameProvider>
  );
}
