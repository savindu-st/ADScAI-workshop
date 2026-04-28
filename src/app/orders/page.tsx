import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OrderService } from "@/lib/services/order";
import { OrdersClient } from "./_components/orders-client";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const orders = await OrderService.listForUser(session.user.id);

  return <OrdersClient orders={orders} userEmail={session.user.email} />;
}
