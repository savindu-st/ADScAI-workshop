import { prisma } from "@/lib/prisma";

export class SlotService {
  static async listAvailable(date: string) {
    const slots = await prisma.pickupSlot.findMany({
      where: { date },
      orderBy: { startTime: "asc" },
    });

    if (slots.length === 0) {
      return this.generateDailySlots(date);
    }

    // Filter out past slots (startTime < now + 20 mins)
    const now = new Date();
    // Use Asia/Kolkata timezone to get current time
    const options = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false } as const;
    const nowTimeStr = now.toLocaleTimeString("en-US", options);
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    // If requesting a past date, return empty
    if (date < todayStr) return [];

    // If requesting today, filter out past slots
    if (date === todayStr) {
      const nowH = parseInt(nowTimeStr.split(":")[0]);
      const nowM = parseInt(nowTimeStr.split(":")[1]);
      const nowTotalMins = nowH * 60 + nowM;

      return slots.filter((slot) => {
        const slotH = parseInt(slot.startTime.split(":")[0]);
        const slotM = parseInt(slot.startTime.split(":")[1]);
        const slotTotalMins = slotH * 60 + slotM;
        return slotTotalMins >= nowTotalMins + 20;
      }).map(slot => ({
        ...slot,
        available: slot.bookedCount < slot.capacity
      }));
    }

    return slots.map(slot => ({
      ...slot,
      available: slot.bookedCount < slot.capacity
    }));
  }

  static async bookSlot(slotId: string) {
    const result = await prisma.$executeRaw`
      UPDATE PickupSlot
      SET bookedCount = bookedCount + 1, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${slotId} AND bookedCount < capacity
    `;
    
    if (result === 0) {
      throw new Error("SLOT_FULL");
    }
  }

  static async releaseSlot(slotId: string) {
    await prisma.$executeRaw`
      UPDATE PickupSlot
      SET bookedCount = bookedCount - 1, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${slotId} AND bookedCount > 0
    `;
  }

  static async generateDailySlots(date: string) {
    const slots = [];
    let currentHour = 11;
    let currentMinute = 0;

    while (currentHour < 23 || (currentHour === 23 && currentMinute === 0)) {
      const startTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
      
      currentMinute += 15;
      if (currentMinute >= 60) {
        currentHour += 1;
        currentMinute = 0;
      }
      
      const endTime = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
      
      if (currentHour > 23 || (currentHour === 23 && currentMinute > 0)) {
          break;
      }

      slots.push({
        date,
        startTime,
        endTime,
        capacity: 10,
      });
    }

    for (const slot of slots) {
      try {
        await prisma.pickupSlot.create({ data: slot });
      } catch (e) {
        // Ignore unique constraint violations (P2002)
      }
    }

    const createdSlots = await prisma.pickupSlot.findMany({
      where: { date },
      orderBy: { startTime: "asc" },
    });
    
    const now = new Date();
    const options = { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false } as const;
    const nowTimeStr = now.toLocaleTimeString("en-US", options);
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    
    if (date === todayStr) {
      const nowH = parseInt(nowTimeStr.split(":")[0]);
      const nowM = parseInt(nowTimeStr.split(":")[1]);
      const nowTotalMins = nowH * 60 + nowM;

      return createdSlots.filter((slot) => {
        const slotH = parseInt(slot.startTime.split(":")[0]);
        const slotM = parseInt(slot.startTime.split(":")[1]);
        const slotTotalMins = slotH * 60 + slotM;
        return slotTotalMins >= nowTotalMins + 20;
      }).map(slot => ({
        ...slot,
        available: slot.bookedCount < slot.capacity
      }));
    }

    return createdSlots.map(slot => ({
        ...slot,
        available: slot.bookedCount < slot.capacity
    }));
  }
}
