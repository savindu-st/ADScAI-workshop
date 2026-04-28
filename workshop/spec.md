# Feature Spec: Pre-ordering with Pickup Time Slots

## Problem Statement

Students currently have no way to order food before physically arriving at the canteen. This forces them to stand in unpredictable queues (5–30 minutes), miss out on sold-out items, and waste time that could be spent in class or labs.

> **Source feedback:**
> - "I waited 25 minutes in line and they ran out of biryani right when it was my turn."
> - "The line is unpredictable. Sometimes 5 minutes, sometimes 30."
> - "I wish I could lock in my food before I leave the lab — like a 'pick up at 12:30' option."
> - "The cashier said 'come back in 20' — I would've ordered earlier if I knew the wait time."

## Goal

Allow authenticated users to place orders ahead of time and select a 15-minute pickup window, so their food is prepared just before they arrive — eliminating queuing and reducing sold-out disappointment.

---

## Scope

### In Scope

- Pickup time slot selection during order placement
- Time slot capacity limits (max orders per slot)
- Slot availability API (which slots are open/full)
- Kitchen-facing order queue sorted by pickup time
- Order status lifecycle: `pending` → `preparing` → `ready` → `picked_up` / `cancelled`
- Cancellation rules (e.g., can't cancel once `preparing`)
- Role-based authorization (student vs kitchen staff)
- Walk-in orders (orders without a time slot) alongside pre-orders

### Out of Scope (for now)

- **Online payment** — orders are pay-on-pickup for v1 (requires payment gateway integration)
- **Push notifications** — future feature; students check status via the app for now
- **Real-time stock counters** — separate feature to show remaining daily specials
- **Group/shared orders** — complex UX and splitting logic, deferred to v2
- **Dietary labelling** (veg/halal/allergen tags) — important but orthogonal; will be its own feature spec
- **Allergen information** (e.g., "contains peanuts") — will be bundled with dietary labelling above
- **Spending history / budget tracking** — useful but unrelated to pre-ordering; separate feature
- **Reorder ("same as last time")** — convenience feature, deferred to v2

---

## Authorization Model

### Roles

The system uses a `role` field on the `User` model to distinguish access levels:

| Role | Description | Permissions |
|---|---|---|
| `student` | Default role for all new sign-ups | Browse menu, browse slots, place orders, view own orders, cancel own orders |
| `kitchen` | Assigned manually via DB seed or admin | All student permissions + view all orders for any slot + update order status |

### Enforcement

- All API routes use the existing `withAuth` wrapper which attaches `userId` to the request.
- Routes that require kitchen access additionally check `user.role === 'kitchen'` and return `403 Forbidden` if the check fails.
- There is no self-service role assignment. Kitchen accounts are created via the seed script or direct DB update.

### Bootstrap

- The `prisma/seed.ts` script creates one kitchen account: `kitchen@canteen.local` / password from `KITCHEN_SEED_PASSWORD` env var.
- All other users default to `role: 'student'` on sign-up.

---

## User Stories

### US-1: Browse available pickup slots
**As a** student,  
**I want to** see which 15-minute pickup windows still have capacity,  
**So that** I can choose a convenient time to collect my food.

**Acceptance criteria:**
- Slots are displayed for today only, starting from the next available slot (at least 20 minutes from now)
- Each slot shows remaining capacity (e.g., "4 slots left")
- Full slots are greyed out and not selectable
- Operating hours: 11:00 AM – 2:00 PM (configurable)
- If no slots exist for today (first request of the day), they are auto-generated on the fly

### US-2: Place a pre-order with a time slot
**As a** student,  
**I want to** select menu items and a pickup time slot, then submit my order,  
**So that** my food is ready when I arrive.

**Acceptance criteria:**
- User must be authenticated (existing `withAuth` wrapper)
- Order includes: items + quantities, selected time slot, optional notes
- `pickupSlotId` is **required** — all orders placed through the pre-order flow must have a time slot
- Order is rejected if the selected slot is now full (race condition guard)
- Order is rejected if any selected menu item is marked unavailable
- Price is locked at order creation: `totalCents` is computed server-side from current menu prices at the moment of submission
- A confirmation screen shows: order summary, pickup time, estimated total
- Order is created with status `pending`

### US-3: View my upcoming orders
**As a** student,  
**I want to** see my active pre-orders and their status,  
**So that** I know when to head to the canteen.

**Acceptance criteria:**
- Orders list shows pickup time, status, and items
- Active orders (not `picked_up` or `cancelled`) are shown first
- Status updates are reflected on page refresh (no real-time push in v1)

### US-4: Cancel a pre-order
**As a** student,  
**I want to** cancel my order if my plans change,  
**So that** I don't waste the canteen's time or my money.

**Acceptance criteria:**
- Cancellation allowed only when status is `pending`
- Cannot cancel once status is `preparing` or later
- Cancelled orders free up the time slot capacity
- Orders for **past** time slots (slot `endTime` has passed) cannot be cancelled — they are terminal
- Status changes to `cancelled`

### US-5: Kitchen views and manages orders by time slot
**As a** kitchen staff member,  
**I want to** see all orders grouped by pickup time slot and update their status,  
**So that** I can prepare food in the right sequence.

**Acceptance criteria:**
- Only accessible to users with `role: 'kitchen'`
- Orders sorted by pickup slot, then by creation time within a slot
- Each order shows: items, quantities, notes, student name
- Staff can update status following this flow:
  - `pending` → `preparing` (kitchen starts making the food — no separate "confirmed" step in v1)
  - `preparing` → `ready` (food is done, waiting for student)
  - `ready` → `picked_up` (kitchen staff marks pickup when student collects the order)

---

## Status Lifecycle

### State machine

```
pending ──→ preparing ──→ ready ──→ picked_up
  │
  └──→ cancelled
```

### Transition rules

| From | To | Who | Notes |
|---|---|---|---|
| `pending` | `preparing` | Kitchen staff | Kitchen acknowledges and starts the order |
| `pending` | `cancelled` | Student | Student cancels before kitchen starts |
| `preparing` | `ready` | Kitchen staff | Food is done |
| `ready` | `picked_up` | Kitchen staff | Student collected the food; staff confirms |
| `ready` | `no_show` | System (future) | Auto-set 30 mins after slot ends if not picked up (v2 cron job) |

> **Design decision — no `confirmed` status in v1:** The original spec had `pending → confirmed → preparing`. In practice, a separate "confirmed" step adds friction without value for a small canteen. The kitchen either starts making the food or ignores it. If confirmation becomes necessary (e.g., for larger operations), it can be re-added as a state between `pending` and `preparing`.

### Who sets `picked_up`?

Kitchen staff marks the order as `picked_up` when the student physically collects the food. Students cannot self-mark pickup (prevents abuse in future paid scenarios).

---

## Data Model Changes

### New model: `PickupSlot`

```prisma
model PickupSlot {
  id          String   @id @default(cuid())
  date        String   // "2026-04-28" (ISO date string, server timezone)
  startTime   String   // "12:00" (HH:mm, 24h format, server timezone)
  endTime     String   // "12:15"
  capacity    Int      @default(10)  // max orders per slot
  bookedCount Int      @default(0)   // denormalized counter for atomic overbooking prevention
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  orders Order[]

  @@unique([date, startTime])
}
```

> **Why `bookedCount` is a denormalized field:** Counting `orders.length` on every request is expensive and cannot be atomically checked-and-incremented in a single DB operation. The denormalized counter allows `SlotService.bookSlot()` to use `UPDATE ... WHERE bookedCount < capacity` in a single atomic query, preventing race conditions without pessimistic locking.

### Modified model: `Order`

```prisma
model Order {
  id           String   @id @default(cuid())
  userId       String
  status       String   @default("pending")
  totalCents   Int
  notes        String?
+ pickupSlotId String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items      OrderItem[]
+ pickupSlot PickupSlot  @relation(fields: [pickupSlotId], references: [id])

  @@index([userId])
+ @@index([pickupSlotId])
}
```

> **`pickupSlotId` is required (non-nullable):** Every pre-order must have a time slot. Walk-in / counter orders are not created through this system — they continue to use the existing POS flow. This avoids ambiguity about how un-slotted orders appear in the kitchen queue.

### Modified model: `User`

```prisma
model User {
  // ... existing fields ...
+ role String @default("student") // "student" | "kitchen"
}
```

### Status values

| Status | Description |
|---|---|
| `pending` | Order placed, awaiting kitchen action |
| `preparing` | Kitchen has started making the food |
| `ready` | Food is ready for pickup |
| `picked_up` | Kitchen staff confirmed student collected the order |
| `cancelled` | Student cancelled the order (only from `pending`) |

---

## API Design

All routes under `/api/` follow the existing patterns: `withAuth` wrapper, service layer delegation, no direct Prisma calls in route handlers.

### Error response format

All error responses use a consistent shape:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}
```

Standard error codes used across endpoints:

| HTTP Status | Code | When |
|---|---|---|
| `400` | `INVALID_REQUEST` | Malformed body, missing required fields, invalid date format |
| `401` | `UNAUTHORIZED` | Missing or invalid auth token |
| `403` | `FORBIDDEN` | Valid auth but insufficient role (e.g., student accessing kitchen endpoint) |
| `404` | `NOT_FOUND` | Slot or order ID doesn't exist |
| `409` | `SLOT_FULL` | Slot reached capacity between selection and submission |
| `409` | `ITEM_UNAVAILABLE` | Menu item is no longer available |
| `422` | `INVALID_STATUS_TRANSITION` | Status change violates the state machine (e.g., `preparing` → `pending`) |

---

### `GET /api/slots?date=2026-04-28`

Returns available pickup slots for the given date.

**Auth:** Not required (public, like the menu endpoint)  
**Query params:**
- `date` (required): ISO date string in `YYYY-MM-DD` format. Must be today's date (server timezone). Future dates return an empty array.

**Response:**
```json
[
  {
    "id": "slot_abc123",
    "date": "2026-04-28",
    "startTime": "12:00",
    "endTime": "12:15",
    "capacity": 10,
    "bookedCount": 6,
    "available": true
  }
]
```

**Rules:**
- If no slots exist for the requested date, calls `SlotService.generateDailySlots()` first (lazy generation)
- Only returns slots where `startTime` is at least 20 minutes from now (server time)
- `available` is `false` when `bookedCount >= capacity`
- All time comparisons use server timezone (Asia/Kolkata, UTC+5:30)

**Errors:**
- `400 INVALID_REQUEST` — missing `date` param or invalid format

---

### `POST /api/orders` (modified)

Existing endpoint, extended to accept a required `pickupSlotId`.

**Auth:** Required (`withAuth`)  
**Request body:**
```json
{
  "items": [{ "menuItemId": "abc", "quantity": 2 }],
  "notes": "No onions please",
  "pickupSlotId": "slot_abc123"
}
```

**Validation:**
- `pickupSlotId` is required; return `400 INVALID_REQUEST` if missing
- Verify the slot exists; return `404 NOT_FOUND` if not
- Verify the slot is in the future (at least `MIN_LEAD_TIME_MINS` from now); return `400 INVALID_REQUEST` if past
- Verify all menu items exist and are available; return `409 ITEM_UNAVAILABLE` if any are unavailable
- Atomically increment the slot's `bookedCount` using `UPDATE ... WHERE bookedCount < capacity`; return `409 SLOT_FULL` if the slot became full
- Compute `totalCents` server-side by summing `item.price * quantity` for all items at current menu prices

**Success response (201):**
```json
{
  "id": "order_xyz",
  "status": "pending",
  "pickupSlot": { "date": "2026-04-28", "startTime": "12:00", "endTime": "12:15" },
  "items": [{ "name": "Biryani", "quantity": 2, "priceCents": 15000 }],
  "totalCents": 30000,
  "notes": "No onions please",
  "createdAt": "2026-04-28T06:25:00.000Z"
}
```

---

### `GET /api/orders` (existing, no changes)

Returns the authenticated user's orders. Existing behavior is unchanged.

---

### `PATCH /api/orders/[id]` (modified)

Extended to support new statuses and cancellation rules.

**Auth:** Required (`withAuth`)  
**Request body:**
```json
{ "status": "cancelled" }
```

**Rules by role:**

| Role | Allowed transitions |
|---|---|
| `student` | `pending` → `cancelled` (own orders only) |
| `kitchen` | `pending` → `preparing`, `preparing` → `ready`, `ready` → `picked_up` |

- Students can only update their own orders (`order.userId === req.userId`)
- Any invalid transition returns `422 INVALID_STATUS_TRANSITION`
- Students attempting kitchen transitions get `403 FORBIDDEN`
- When cancelling: decrement the slot's `bookedCount` (free the capacity) — but only if the slot's `endTime` has not passed (no-op for expired slots since the capacity is irrelevant)

**Errors:**
- `403 FORBIDDEN` — student trying to set `preparing`/`ready`/`picked_up`, or updating another user's order
- `404 NOT_FOUND` — order ID doesn't exist
- `422 INVALID_STATUS_TRANSITION` — violates the state machine

---

### `GET /api/slots/[date]/orders` (new, kitchen-facing)

Returns all orders for a given date, grouped by slot.

**Auth:** Required (`withAuth` + `role: 'kitchen'`). Returns `403 FORBIDDEN` for students.  
**Response:**
```json
[
  {
    "slot": { "id": "slot_abc", "startTime": "12:00", "endTime": "12:15" },
    "orders": [
      {
        "id": "order_xyz",
        "userName": "Alice",
        "status": "pending",
        "items": [{ "name": "Biryani", "quantity": 1 }],
        "notes": "Extra raita",
        "createdAt": "2026-04-28T06:10:00.000Z"
      }
    ]
  }
]
```

**Rules:**
- Orders within each slot are sorted by `createdAt` ascending (first-come-first-served prep order)
- Includes all statuses except `cancelled` (kitchen doesn't need to see cancelled orders)
- Slots with zero non-cancelled orders are omitted

---

## Service Layer

### New: `SlotService` (`src/lib/services/slot.ts`)

| Method | Description |
|---|---|
| `listAvailable(date: string)` | Returns slots for the date with booked counts, filtering out past slots. Calls `generateDailySlots()` if no slots exist for the date. |
| `bookSlot(slotId: string)` | Atomically increments `bookedCount` using `UPDATE PickupSlot SET bookedCount = bookedCount + 1 WHERE id = ? AND bookedCount < capacity`. Throws `SlotFullError` if no rows updated. |
| `releaseSlot(slotId: string)` | Decrements `bookedCount` (on cancellation). Only decrements if `bookedCount > 0` to prevent negative counts. |
| `generateDailySlots(date: string)` | Creates 15-min slots between operating hours if they don't exist for the given date. Uses `createMany` with `skipDuplicates: true` to be idempotent. |

### Slot generation strategy

Slots are generated **lazily on first access**: when `listAvailable()` is called for a date with no existing slots, it calls `generateDailySlots()` before returning results. This avoids the need for a cron job or startup hook while remaining idempotent (safe to call multiple times).

### Modified: `OrderService` (`src/lib/services/order.ts`)

| Change | Description |
|---|---|
| `create()` | Requires `pickupSlotId`. Looks up current menu prices to compute `totalCents`. Calls `SlotService.bookSlot()` inside a Prisma `$transaction` alongside order creation. |
| `updateStatus()` | Validates the transition against the state machine. Checks `user.role` to determine allowed transitions. Calls `SlotService.releaseSlot()` on cancellation. |

### Price computation

`totalCents` is computed server-side inside `OrderService.create()`:
1. Fetch all `MenuItem` records for the given IDs
2. Verify all items exist and are available (throw `ItemUnavailableError` if not)
3. Compute `totalCents = Σ(item.priceCents × quantity)`
4. Store the computed total on the `Order` — this locks the price at order time

If a menu item's price changes after the order is placed, the order retains the price at time of submission.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `SLOT_START_HOUR` | `11` | First slot starts at 11:00 AM |
| `SLOT_END_HOUR` | `14` | Last slot ends at 2:00 PM |
| `SLOT_DURATION_MINS` | `15` | Each slot is 15 minutes |
| `SLOT_CAPACITY` | `10` | Max orders per slot |
| `MIN_LEAD_TIME_MINS` | `20` | Minimum time before a slot to allow ordering |
| `KITCHEN_SEED_PASSWORD` | (required) | Password for the seeded kitchen account |
| `TZ` | `Asia/Kolkata` | Server timezone for all time comparisons |

---

## UI Specification

### Page structure

| Page / Route | Description |
|---|---|
| `/order` | Main pre-order flow: menu → slot selection → confirmation |
| `/orders` | Student's order history (existing, extended with slot info) |
| `/kitchen` | Kitchen dashboard: orders grouped by time slot |

### Student: Pre-order flow (`/order`)

**Step 1 — Menu selection:**
- Display menu items with name, price, and availability
- Student adds items to cart with quantity selectors
- Running total displayed in a sticky bottom bar
- "Next: Choose Pickup Time" button (disabled if cart is empty)

**Step 2 — Slot selection:**
- Show today's time slots as a horizontal scrollable list or grid of pill buttons
- Each slot shows: time range (e.g., "12:00 – 12:15") and remaining capacity
- Available slots are selectable; full slots are greyed out with "Full" label
- Selected slot is highlighted
- "Review Order" button

**Step 3 — Confirmation:**
- Summary: item list with quantities and prices, total, selected pickup time, optional notes text field
- "Place Order" button → POST to API → success screen with order ID and pickup time
- On `409 SLOT_FULL`: show inline error "This slot just filled up — please pick another" and return to step 2

**UI states:**
- **Loading:** Skeleton placeholders for menu items and slot list
- **Empty menu:** "No items available right now" message
- **No slots available:** "All pickup slots for today are full. Try again tomorrow!" message
- **Error:** Toast notification with retry option

### Student: My Orders (`/orders`)

- List of orders, most recent first
- Each card shows: pickup time, status badge (color-coded), item names, total
- Active orders (not `picked_up` or `cancelled`) pinned to top
- Status badge colors: `pending` = yellow, `preparing` = blue, `ready` = green, `picked_up` = grey, `cancelled` = red
- Pull-to-refresh or refresh button (no real-time updates in v1)

### Kitchen: Dashboard (`/kitchen`)

- Only accessible to users with `role: 'kitchen'` (redirect to `/` otherwise)
- Orders grouped by time slot, displayed as collapsible sections
- Current/next slot is expanded by default
- Each order card shows: student name, items + quantities, notes, status
- Action buttons on each order card:
  - `pending` → "Start Preparing" button
  - `preparing` → "Mark Ready" button
  - `ready` → "Confirm Pickup" button
- Visual indicator for slots approaching their time (e.g., amber border if < 10 mins away)
- Auto-refresh every 30 seconds (polling, not WebSocket)

### Responsive design

- All pages must work on mobile viewports (min 360px width)
- Slot selection uses horizontal scroll on mobile, grid on desktop
- Kitchen dashboard is optimized for tablet landscape (primary use case)

---

## File Changes Summary

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `PickupSlot` model (with `bookedCount`), add `pickupSlotId` to `Order`, add `role` to `User` |
| `src/lib/services/slot.ts` | New | `SlotService` with slot generation, booking, releasing |
| `src/lib/services/order.ts` | Modify | Require `pickupSlotId` in create, compute `totalCents` server-side, enforce status transitions by role |
| `src/app/api/slots/route.ts` | New | `GET` — list available slots for a date (with lazy generation) |
| `src/app/api/slots/[date]/orders/route.ts` | New | `GET` — kitchen view of orders by slot (kitchen role required) |
| `src/app/api/orders/route.ts` | Modify | `POST` — require `pickupSlotId`, validate slot capacity atomically |
| `src/app/api/orders/[id]/route.ts` | Modify | `PATCH` — enforce status transition rules by role |
| `src/app/order/page.tsx` | New | Pre-order flow (menu → slot → confirm) |
| `src/app/kitchen/page.tsx` | New | Kitchen dashboard |
| `src/app/orders/page.tsx` | Modify | Extend with pickup time display and status badges |
| `prisma/seed.ts` | Modify | Seed today's pickup slots + kitchen user account |
| `prisma/migrations/` | New | Migration for `PickupSlot` model, `Order.pickupSlotId`, `User.role` |
| `tests/` | New/Modify | See Testing Strategy below |

---

## Migration Plan

### Database migration

1. Run `npx prisma migrate dev --name add-preorder-slots` to generate the migration
2. The migration will:
   - Create the `PickupSlot` table
   - Add `pickupSlotId` (non-nullable) to `Order` — see backward compat note below
   - Add `role` column to `User` with default `'student'`

### Backward compatibility

- **Existing orders:** Since `pickupSlotId` is non-nullable in the new schema, existing orders need handling. Two options:
  - **Option A (recommended for dev/workshop):** Reset the database (`prisma migrate reset`). Acceptable since this is a workshop project with seed data.
  - **Option B (production-safe):** Add `pickupSlotId` as nullable first, backfill existing orders with a "legacy" slot, then alter to non-nullable.
- **Existing users:** The `role` column defaults to `'student'`, so existing users are unaffected.

### Seed updates

- Seed script generates today's pickup slots (11:00 AM – 2:00 PM, 15-min intervals)
- Seed script creates one kitchen account with known credentials

---

## Testing Strategy

### Unit tests (`tests/unit/`)

| Test file | What it covers |
|---|---|
| `slot.service.test.ts` | `generateDailySlots` creates correct number of slots; `bookSlot` increments count; `bookSlot` throws when full; `releaseSlot` decrements count; `releaseSlot` doesn't go below 0 |
| `order.service.test.ts` | `create` computes `totalCents` correctly; `create` rejects unavailable items; `updateStatus` enforces valid transitions; `updateStatus` rejects invalid transitions; cancellation calls `releaseSlot` |
| `status-machine.test.ts` | All valid transitions succeed; all invalid transitions throw `INVALID_STATUS_TRANSITION`; role-based restrictions (student can only cancel, kitchen can only advance) |

### Integration tests (`tests/integration/`)

| Test file | What it covers |
|---|---|
| `slot-booking.test.ts` | Full flow: generate slots → book → verify count incremented → book until full → verify 409 returned |
| `order-lifecycle.test.ts` | Full flow: create order → kitchen sets preparing → ready → picked_up; verify slot count doesn't change on non-cancel transitions |
| `cancellation.test.ts` | Cancel from `pending` succeeds and frees slot; cancel from `preparing` fails with 422; cancel past-slot order fails |
| `race-condition.test.ts` | Send N concurrent `POST /api/orders` requests for a slot with 1 remaining capacity; verify exactly 1 succeeds and N-1 get 409 |

### Race condition testing approach

- Use `Promise.all` to send 5+ simultaneous booking requests to a slot with capacity 1
- Assert that exactly 1 request returns 201 and the rest return 409
- Assert that `bookedCount` equals `capacity` after all requests complete (no overbooking)

### Manual / browser testing

- Place an order through the UI and verify confirmation screen
- Attempt to book a full slot and verify error message
- Log in as kitchen user and verify the dashboard shows the order
- Progress an order through all statuses and verify UI updates

---

## Edge Cases & Risks

| Risk | Mitigation |
|---|---|
| **Race condition:** Two users book the last slot simultaneously | `bookSlot` uses atomic `UPDATE ... WHERE bookedCount < capacity`. If zero rows updated, throw `SlotFullError` → API returns `409 SLOT_FULL`. |
| **Stale slots on the UI:** User sees a slot as available but it fills before they submit | Return `409 SLOT_FULL` with a clear error message, prompt user to pick another slot. UI returns to slot selection step. |
| **Timezone confusion:** Server vs client time mismatch | All times stored and compared in server timezone (Asia/Kolkata, UTC+5:30). Client sends only the `date` as a `YYYY-MM-DD` string; the server determines "now" and filters slots. |
| **No-shows:** Student orders but never picks up | v1: kitchen manually marks as `picked_up`. v2: cron job auto-expires orders 30 mins after slot end to status `no_show`. |
| **Kitchen overload:** Too many orders in one slot | Enforced by `SLOT_CAPACITY` — slot becomes unavailable when `bookedCount >= capacity`. |
| **Negative bookedCount:** Bug or double-cancellation decrements below 0 | `releaseSlot` includes guard: `UPDATE ... SET bookedCount = bookedCount - 1 WHERE bookedCount > 0`. |
| **Slot generation race:** Two requests trigger `generateDailySlots` simultaneously | `createMany` with `skipDuplicates: true` ensures idempotency. `@@unique([date, startTime])` prevents duplicate slots at the DB level. |
| **Price drift:** Menu price changes between user viewing and submitting | Price is locked at order creation time. `totalCents` is computed server-side and stored immutably on the order. |
| **Cancelling past-slot orders:** Student tries to cancel an order whose slot has already ended | Cancellation is only allowed for orders with status `pending`. Once the kitchen has started (`preparing`), it cannot be cancelled. Past slots are implicitly handled since kitchen would have already advanced the status. |
| **Kitchen privacy:** Student accesses kitchen endpoint | `GET /api/slots/[date]/orders` checks `user.role === 'kitchen'` and returns `403 FORBIDDEN` for non-kitchen users. |

---

## Success Metrics

- **Queue time reduction:** Average physical wait drops below 5 minutes
- **Pre-order adoption:** >30% of daily orders placed via pre-order within 2 weeks
- **Sold-out frustration:** Reduction in "arrived but item gone" complaints
- **Slot utilization:** >60% of available slots are booked during peak hours
- **Zero overbookings:** `bookedCount` never exceeds `capacity` in production
