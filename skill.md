# Skill: Next.js & Prisma Pre-ordering Patterns

This document outlines reusable architectural patterns and "skills" established during the implementation of the Pre-ordering and Pickup Slots feature. Reference these patterns when building similar booking or queueing systems.

## 1. Atomic Booking (Concurrency Control without Locks)
When managing limited inventory or capacity, avoid pessimistic locking if possible, as it can bottleneck the database. Instead, use atomic increments with conditional updates.

**Pattern (Prisma):**
```typescript
const result = await prisma.$executeRaw`
  UPDATE PickupSlot
  SET bookedCount = bookedCount + 1, updatedAt = CURRENT_TIMESTAMP
  WHERE id = ${slotId} AND bookedCount < capacity
`;

if (result === 0) {
  throw new Error("SLOT_FULL");
}
```
*Why this works*: The database engine inherently handles the atomicity of the `UPDATE` statement. If 10 requests hit simultaneously for 1 remaining spot, the database evaluates the `WHERE bookedCount < capacity` for each sequentially at the transaction boundary, successfully updating only 1 and returning `0` modified rows for the rest.

## 2. Idempotent Seeding in SQLite
SQLite has limited support for advanced bulk operations. Specifically, Prisma's `createMany({ skipDuplicates: true })` throws an error in SQLite environments.

**Pattern:**
```typescript
for (const item of items) {
  try {
    await prisma.model.create({ data: item });
  } catch (e) {
    // Gracefully ignore unique constraint violations (P2002)
  }
}
```
*When to use*: Seeding default application data, generating future time slots lazily, or importing external CSVs where partial duplicates exist.

## 3. Boundary-Level Role Authorization
Instead of complex middleware configurations that try to parse everything, enforce business rules and roles directly at the API route boundary where the user object is already resolved.

**Pattern (Next.js API Routes):**
```typescript
export const PATCH = withAuth(async (req, auth, ctx) => {
  // 1. Fetch exact role from DB
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true }
  });

  // 2. Pass role into pure service layer for validation
  try {
    const data = await Service.performAction({ id: auth.userId, role: user.role });
    return NextResponse.json(data);
  } catch(e) {
    if (e.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
});
```

## 4. Single-Component Multi-Step Wizard
For checkout or booking flows (e.g., Menu -> Time Selection -> Confirmation), keep the state localized to a single client component if the flow is entirely synchronous and temporary. 

**Pattern:**
- Track step index: `const [step, setStep] = useState<1 | 2 | 3>(1);`
- Keep shared state: `const [cart, setCart] = useState({})`
- Use short-circuit rendering (`{step === 1 && <StepOne />}`) to hide/show views.
*Benefits*: Avoids complex global state (Redux/Zustand), prevents orphaned data if the user navigates away, and makes it trivial to pass data between steps.
