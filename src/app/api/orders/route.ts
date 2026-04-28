import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

export const GET = withAuth(async (_req, ctx) => {
  const orders = await OrderService.listForUser(ctx.userId);
  return NextResponse.json(orders);
});

export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required", code: "INVALID_REQUEST" }, { status: 400 });
  }

  if (typeof body.pickupSlotId !== "string" || !body.pickupSlotId) {
    return NextResponse.json({ error: "pickupSlotId required", code: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const order = await OrderService.create({
      userId: ctx.userId,
      items: body.items,
      notes: body.notes,
      pickupSlotId: body.pickupSlotId,
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_FULL") {
        return NextResponse.json({ error: "Slot is full", code: "SLOT_FULL" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "ITEM_UNAVAILABLE") {
        return NextResponse.json({ error: "Item unavailable", code: "ITEM_UNAVAILABLE" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to place order", code: "INTERNAL_ERROR" }, { status: 500 });
  }
});
