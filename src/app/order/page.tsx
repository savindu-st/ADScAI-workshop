import { MenuService } from "@/lib/services/menu";
import { OrderClient } from "./_components/order-client";

export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const items = await MenuService.list();
  return <OrderClient items={items} />;
}
