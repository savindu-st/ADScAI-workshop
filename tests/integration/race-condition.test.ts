import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { SlotService } from "@/lib/services/slot";

const prisma = new PrismaClient();

describe("Slot Booking Race Condition", () => {
  beforeAll(async () => {
    await prisma.pickupSlot.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prevents overbooking when multiple requests occur simultaneously", async () => {
    const slot = await prisma.pickupSlot.create({
      data: {
        date: "2099-01-01",
        startTime: "12:00",
        endTime: "12:15",
        capacity: 10,
        bookedCount: 9, // Only 1 spot left
      },
    });

    // Simulate 5 concurrent requests trying to book the last spot
    const attempts = Array.from({ length: 5 }).map(() => SlotService.bookSlot(slot.id));
    
    const results = await Promise.allSettled(attempts);
    
    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    // Exactly one should succeed
    expect(successful.length).toBe(1);
    expect(failed.length).toBe(4);

    // Verify the database count didn't exceed capacity
    const updatedSlot = await prisma.pickupSlot.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.bookedCount).toBe(10);
  });
});
