import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";

const prisma = new PrismaClient();

const MENU_SEED = [
  { name: "Chicken Biryani", description: "Slow-cooked basmati with chicken and saffron", priceCents: 350, category: "main", available: true },
  { name: "Paneer Butter Masala", description: "Cottage cheese in a tomato-cream gravy", priceCents: 320, category: "main", available: true },
  { name: "Veg Thali", description: "Daily vegetarian platter with dal, sabzi, rice, roti", priceCents: 280, category: "main", available: true },
  { name: "Fish Curry & Rice", description: "House fish curry with steamed rice", priceCents: 360, category: "main", available: false },
  { name: "Masala Dosa", description: "Crispy rice crepe with potato filling", priceCents: 200, category: "main", available: true },
  { name: "Masala Chai", description: "Spiced milk tea", priceCents: 50, category: "drink", available: true },
  { name: "Filter Coffee", description: "South-Indian filter coffee", priceCents: 60, category: "drink", available: true },
  { name: "Fresh Lime Soda", description: "Sweet or salted", priceCents: 80, category: "drink", available: true },
  { name: "Samosa", description: "Two pieces, mint chutney", priceCents: 90, category: "snack", available: true },
  { name: "Banana Chips", description: "Kerala style, lightly salted", priceCents: 70, category: "snack", available: true },
];

const USERS_SEED = [
  { name: "Asha Patel",   email: "asha@example.com",   password: "asha-password-1", role: "student" },
  { name: "Ravi Kumar",   email: "ravi@example.com",   password: "ravi-password-1", role: "student" },
  { name: "Maya Iyer",    email: "maya@example.com",   password: "maya-password-1", role: "student" },
  { name: "Kitchen Staff",email: "kitchen@canteen.local", password: process.env.KITCHEN_SEED_PASSWORD || "kitchen123", role: "kitchen" },
];

async function ensureUser(u: (typeof USERS_SEED)[number]) {
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  if (existing) return existing;
  const res = await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: res.user.email } });
  if (user.role !== u.role) {
    return prisma.user.update({ where: { id: user.id }, data: { role: u.role } });
  }
  return user;
}

function generateSlotsForToday() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
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
    
    // Don't add the slot that starts exactly at 14:00 if operating hours are 11-14
    if (currentHour > 23 || (currentHour === 23 && currentMinute > 0)) {
      break;
    }

    slots.push({
      date: today,
      startTime,
      endTime,
      capacity: 10,
    });
  }
  return slots;
}

async function main() {
  console.log("Resetting orders, slots & menu…");
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pickupSlot.deleteMany();
  await prisma.menuItem.deleteMany();

  console.log("Seeding menu items…");
  for (const item of MENU_SEED) {
    await prisma.menuItem.create({ data: item });
  }

  console.log("Seeding slots…");
  const slotsData = generateSlotsForToday();
  for (const slot of slotsData) {
    try {
      await prisma.pickupSlot.create({ data: slot });
    } catch (e) {
      // ignore
    }
  }
  const slots = await prisma.pickupSlot.findMany();

  console.log("Seeding users (idempotent — keeps existing accounts)…");
  const users = [];
  for (const u of USERS_SEED) {
    const user = await ensureUser(u);
    console.log(`  ✓ ${user.email} (id=${user.id}, role=${user.role})`);
    users.push(user);
  }

  const menu = await prisma.menuItem.findMany();
  const biryani = menu.find((m) => m.name === "Chicken Biryani")!;
  const chai = menu.find((m) => m.name === "Masala Chai")!;
  const dosa = menu.find((m) => m.name === "Masala Dosa")!;
  const samosa = menu.find((m) => m.name === "Samosa")!;

  console.log("Seeding sample orders for first user…");
  const [primary] = users;
  
  // Pick two slots for the sample orders
  const slot1 = slots[0];
  const slot2 = slots[1];

  await prisma.order.create({
    data: {
      userId: primary.id,
      status: "ready",
      totalCents: biryani.priceCents + chai.priceCents,
      notes: "less spicy please",
      pickupSlotId: slot1.id,
      items: {
        create: [
          { menuItemId: biryani.id, quantity: 1, unitPriceCents: biryani.priceCents },
          { menuItemId: chai.id, quantity: 1, unitPriceCents: chai.priceCents },
        ],
      },
    },
  });
  await prisma.pickupSlot.update({ where: { id: slot1.id }, data: { bookedCount: { increment: 1 } } });

  await prisma.order.create({
    data: {
      userId: primary.id,
      status: "pending",
      totalCents: dosa.priceCents + samosa.priceCents * 2,
      pickupSlotId: slot2.id,
      items: {
        create: [
          { menuItemId: dosa.id, quantity: 1, unitPriceCents: dosa.priceCents },
          { menuItemId: samosa.id, quantity: 2, unitPriceCents: samosa.priceCents },
        ],
      },
    },
  });
  await prisma.pickupSlot.update({ where: { id: slot2.id }, data: { bookedCount: { increment: 1 } } });

  const counts = {
    users: await prisma.user.count(),
    menu: await prisma.menuItem.count(),
    slots: await prisma.pickupSlot.count(),
    orders: await prisma.order.count(),
    items: await prisma.orderItem.count(),
  };
  console.log("Done:", counts);
  console.log("Try signing in as:");
  for (const u of USERS_SEED) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
