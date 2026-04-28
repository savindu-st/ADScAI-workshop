# Session Learnings: Pre-ordering with Pickup Time Slots

This document summarizes the architectural decisions, technical gotchas, and general learnings from implementing the Pre-ordering feature with Pickup Time Slots in the Canteen application.

## 1. Database and Concurrency

- **Atomic Increments for Race Conditions**: Instead of relying on pessimistic locking (which can be complex and impact performance), we used Prisma's atomic increment feature (`bookedCount = bookedCount + 1`) paired with a `WHERE bookedCount < capacity` condition. This successfully handles race conditions when multiple users try to book the final spot in a slot at the same moment.
- **SQLite Limitations with Prisma**: We discovered that Prisma's `createMany({ skipDuplicates: true })` is **not supported** in SQLite. To achieve idempotent bulk creation (e.g., seeding daily slots), we had to iterate and use a standard `create()` wrapped in a `try/catch` block to safely ignore unique constraint violations (Prisma error `P2002`).

## 2. API Design & Authentication

- **Role-Based Authorization at the Boundary**: We added a `role` field to the `User` model (`student` vs `kitchen`). Instead of complex middleware, we extended the existing `withAuth` wrapper pattern and validated roles explicitly in specific API route handlers (e.g., restricting `GET /api/slots/[date]/orders` to kitchen staff only).
- **Service Layer Abstraction**: Business logic (like slot capacity verification and state machine transitions) was kept strictly inside `SlotService` and `OrderService`. API routes merely handle HTTP request parsing, authentication extraction, and returning formatted JSON.

## 3. Handling Time and Timezones

- **Timezone Consistency**: Because the server and users could theoretically be in different time zones, all time-based logic (e.g., checking if a slot is 20 minutes in the future) was explicitly pinned to the `Asia/Kolkata` timezone using `toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false })`.
- **Lazy Generation**: Rather than using a cron job, time slots are generated "lazily." The first user who hits `/api/slots` on a given day triggers the generation of slots for that day. This saves database space and avoids background workers.

## 4. UI/UX Workflow

- **Multi-step Flow without Routing**: The `/order` page was built as a 3-step wizard (Menu -> Slot Selection -> Confirmation) entirely within a single client component (`order-client.tsx`). This kept the state (the user's cart) simple to manage without needing external state management libraries like Redux or React Context.
- **Dynamic Dashboards**: The `/kitchen` dashboard fetches orders grouped by time slot and polls the server every 30 seconds to keep the queue fresh.

## 5. Next.js and Dev Environment Gotchas

- **Prisma Client Cache in Dev**: When making schema changes (`schema.prisma`) while the Next.js dev server is running, the running process retains the old Prisma Client in memory. This leads to `500 Internal Server Errors` if the API tries to query new tables. You must completely restart the Next.js dev server after running a Prisma migration.
- **Windows Detached Processes**: Starting background Node.js processes from certain Windows orchestration scripts can be problematic. We successfully managed testing by ensuring background execution allowed adequate time for the telemetry prompts to bypass (via `$env:NEXT_TELEMETRY_DISABLED=1`).
