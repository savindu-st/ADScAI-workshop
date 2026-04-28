import { prisma } from "@/lib/prisma";
import { SlotService } from "./slot";

export class OrderService {
  static async listForUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: { include: { menuItem: true } }, pickupSlot: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async create(args: {
    userId: string;
    items: Array<{ menuItemId: string; quantity: number }>;
    notes?: string;
    pickupSlotId: string;
  }) {
    const { userId, items, notes, pickupSlotId } = args;

    // Check availability and existence of menu items
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) }, available: true },
    });

    if (menuItems.length !== items.length) {
        throw new Error("ITEM_UNAVAILABLE");
    }

    const totalCents = items.reduce((sum, item) => {
      const m = menuItems.find((mi) => mi.id === item.menuItemId);
      if (!m) return sum;
      return sum + m.priceCents * item.quantity;
    }, 0);

    // Book slot first (atomic increment)
    try {
        await SlotService.bookSlot(pickupSlotId);
    } catch (e) {
        throw new Error("SLOT_FULL");
    }

    try {
      return await prisma.order.create({
        data: {
          userId,
          notes,
          totalCents,
          pickupSlotId,
          items: {
            create: items.map((item) => {
              const m = menuItems.find((mi) => mi.id === item.menuItemId);
              return {
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPriceCents: m?.priceCents ?? 0,
              };
            }),
          },
        },
        include: { items: { include: { menuItem: true } }, pickupSlot: true },
      });
    } catch (e) {
        // Rollback slot booking if order creation fails
        await SlotService.releaseSlot(pickupSlotId);
        throw e;
    }
  }

  static async byId(id: string, userId: string) {
    return prisma.order.findFirst({
      where: { id, userId },
      include: { items: { include: { menuItem: true } }, pickupSlot: true },
    });
  }

  static async updateStatus(id: string, user: { id: string; role: string }, status: string) {
    // Basic state machine validation
    const order = await prisma.order.findFirst({ 
        where: { id },
        include: { pickupSlot: true }
    });
    
    if (!order) return null;

    if (user.role === "student") {
        // Students can only cancel pending orders that belong to them
        if (status !== "cancelled" || order.status !== "pending" || order.userId !== user.id) {
            throw new Error("INVALID_STATUS_TRANSITION");
        }
        
        // Check if slot is in the past, if so, don't allow cancellation
        const now = new Date();
        const options = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false } as const;
        const nowTimeStr = now.toLocaleTimeString("en-US", options);
        const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        
        if (order.pickupSlot && order.pickupSlot.date === todayStr) {
            if (order.pickupSlot.endTime < nowTimeStr) {
                throw new Error("INVALID_STATUS_TRANSITION"); // Past slot
            }
        } else if (order.pickupSlot && order.pickupSlot.date < todayStr) {
            throw new Error("INVALID_STATUS_TRANSITION"); // Past slot
        }
        
        await SlotService.releaseSlot(order.pickupSlotId!);
    } else if (user.role === "kitchen") {
        // Kitchen role transitions
        const validKitchenTransitions: Record<string, string[]> = {
            "pending": ["preparing"],
            "preparing": ["ready"],
            "ready": ["picked_up"]
        };
        
        if (!validKitchenTransitions[order.status]?.includes(status)) {
             throw new Error("INVALID_STATUS_TRANSITION");
        }
    } else {
        throw new Error("FORBIDDEN");
    }

    return prisma.order.update({
      where: { id },
      data: { status },
      include: { items: { include: { menuItem: true } }, pickupSlot: true },
    });
  }

  static async remove(id: string, userId: string) {
    const order = await prisma.order.findFirst({ where: { id, userId } });
    if (!order) return null;
    return prisma.order.delete({ where: { id } });
  }
}
