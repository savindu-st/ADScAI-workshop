import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ date: string }> };

export const GET = withAuth(async (_req, auth, ctx: Ctx) => {
  // Check if user is kitchen staff
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true }
  });

  if (user?.role !== "kitchen") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { date } = await ctx.params;

  const slots = await prisma.pickupSlot.findMany({
    where: { date },
    orderBy: { startTime: "asc" },
    include: {
      orders: {
        where: {
          status: { not: "cancelled" }
        },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { name: true } },
          items: { include: { menuItem: true } }
        }
      }
    }
  });

  const formattedSlots = slots
    .filter((slot) => slot.orders.length > 0)
    .map((slot) => ({
      slot: {
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      },
      orders: slot.orders.map((order) => ({
        id: order.id,
        userName: order.user.name,
        status: order.status,
        items: order.items.map((item) => ({
          name: item.menuItem.name,
          quantity: item.quantity,
        })),
        notes: order.notes,
        createdAt: order.createdAt,
      })),
    }));

  return NextResponse.json(formattedSlots);
});
