import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KitchenClient } from "./_components/kitchen-client";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "kitchen") {
    redirect("/");
  }

  return <KitchenClient />;
}
