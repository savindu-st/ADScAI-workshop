import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SlotService } from "@/lib/services/slot";

const prisma = new PrismaClient();

describe("SlotService", () => {
  beforeAll(async () => {
    await prisma.pickupSlot.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("generates slots correctly if none exist", async () => {
    const date = "2099-01-02";
    const slots = await SlotService.listAvailable(date);
    expect(slots.length).toBeGreaterThan(0);
    // 11:00 to 14:00 is 3 hours = 12 slots of 15 mins
    expect(slots.length).toBe(12);
    expect(slots[0].startTime).toBe("11:00");
    expect(slots[slots.length - 1].endTime).toBe("14:00");
  });

  it("throws SLOT_FULL error when trying to book a full slot", async () => {
    const slot = await prisma.pickupSlot.create({
      data: {
        date: "2099-01-03",
        startTime: "12:00",
        endTime: "12:15",
        capacity: 2,
        bookedCount: 2, // Full
      },
    });

    await expect(SlotService.bookSlot(slot.id)).rejects.toThrow("SLOT_FULL");
  });

  it("releases slot capacity", async () => {
    const slot = await prisma.pickupSlot.create({
      data: {
        date: "2099-01-04",
        startTime: "12:00",
        endTime: "12:15",
        capacity: 10,
        bookedCount: 5,
      },
    });

    await SlotService.releaseSlot(slot.id);
    
    const updatedSlot = await prisma.pickupSlot.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.bookedCount).toBe(4);
  });
});
