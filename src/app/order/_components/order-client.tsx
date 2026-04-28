"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  category: string;
  available: boolean;
};

type PickupSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  available: boolean;
};

type Cart = Record<string, number>;

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const categoryEmoji: Record<string, string> = {
  main: "🍛",
  drink: "🥤",
  snack: "🥟",
  dessert: "🍰",
};

export function OrderClient({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cart, setCart] = useState<Cart>({});
  const [notes, setNotes] = useState("");
  
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  }, [items]);

  const totalCents = useMemo(() => {
    return items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.priceCents, 0);
  }, [items, cart]);

  const totalCount = Object.values(cart).reduce((a, b) => a + b, 0);

  function setQty(id: string, qty: number) {
    setSuccessId(null);
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  // Fetch slots when moving to step 2
  useEffect(() => {
    if (step === 2 && slots.length === 0) {
      setLoadingSlots(true);
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      fetch(`/api/slots?date=${todayStr}`)
        .then((r) => r.json())
        .then((data) => {
           if (Array.isArray(data)) {
               setSlots(data);
           }
        })
        .finally(() => setLoadingSlots(false));
    }
  }, [step, slots.length]);

  async function placeOrder() {
    if (!selectedSlotId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Object.entries(cart).map(([menuItemId, quantity]) => ({
            menuItemId,
            quantity,
          })),
          pickupSlotId: selectedSlotId,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "SLOT_FULL") {
           setStep(2); // Go back to slot selection
           // Refresh slots
           const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
           fetch(`/api/slots?date=${todayStr}`).then(r => r.json()).then(data => {
               if (Array.isArray(data)) setSlots(data);
           });
           throw new Error("This slot just filled up — please pick another");
        }
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const order = await res.json();
      setCart({});
      setStep(1);
      setSelectedSlotId(null);
      setSuccessId(order.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const loggedIn = !!session?.user;

  return (
    <section>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Pre-order</h1>
        <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", fontSize: "0.9rem" }}>
           <span style={{ fontWeight: step >= 1 ? 600 : 400, color: step >= 1 ? "var(--brand)" : "var(--muted)" }}>1. Menu</span>
           <span style={{ color: "var(--border-strong)" }}>›</span>
           <span style={{ fontWeight: step >= 2 ? 600 : 400, color: step >= 2 ? "var(--brand)" : "var(--muted)" }}>2. Time</span>
           <span style={{ color: "var(--border-strong)" }}>›</span>
           <span style={{ fontWeight: step === 3 ? 600 : 400, color: step === 3 ? "var(--brand)" : "var(--muted)" }}>3. Confirm</span>
        </div>
      </div>

      {successId && step === 1 && (
        <div
          style={{
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <span>
            <strong>Order placed.</strong> We'll have it ready shortly.
          </span>
          <a href="/orders" className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>
            View orders
          </a>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {/* STEP 1: MENU */}
      {step === 1 && (
        <div>
          {items.length === 0 && (
             <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
               No items available right now
             </div>
          )}
          {Object.entries(byCategory).map(([category, list]) => (
            <div key={category} style={{ marginBottom: "2.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
                <span aria-hidden style={{ fontSize: "1.2rem" }}>
                  {categoryEmoji[category] ?? "•"}
                </span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.05rem",
                    textTransform: "capitalize",
                    fontWeight: 700,
                  }}
                >
                  {category}
                </h2>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{list.length} items</span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
                {list.map((item) => {
                  const qty = cart[item.id] ?? 0;
                  return (
                    <li
                      key={item.id}
                      className={item.available ? "card menu-item" : "card"}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "1rem 1.1rem",
                        background: item.available ? "var(--card)" : "var(--card-alt)",
                        opacity: item.available ? 1 : 0.7,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "1rem" }}>{item.name}</div>
                        {item.description && (
                          <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>
                            {item.description}
                          </div>
                        )}
                        {!item.available && (
                          <span className="badge badge-soldout" style={{ marginTop: 6 }}>
                            Sold out
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexShrink: 0 }}>
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.95rem" }}>
                          {formatPrice(item.priceCents)}
                        </span>
                        {item.available && qty === 0 && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              if (!loggedIn) {
                                router.push("/login");
                                return;
                              }
                              setQty(item.id, 1);
                            }}
                          >
                            Add
                          </button>
                        )}
                        {item.available && loggedIn && qty > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              background: "var(--card-alt)",
                              borderRadius: 8,
                              padding: "0.25rem 0.4rem",
                            }}
                          >
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => setQty(item.id, qty - 1)}
                              aria-label="Decrease"
                            >
                              −
                            </button>
                            <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600, fontSize: "0.9rem" }}>
                              {qty}
                            </span>
                            <button
                              type="button"
                              className="qty-btn"
                              onClick={() => setQty(item.id, qty + 1)}
                              aria-label="Increase"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {totalCount > 0 && (
            <div
              style={{
                position: "sticky",
                bottom: "1rem",
                background: "#0f172a",
                color: "white",
                padding: "0.85rem 1rem 0.85rem 1.25rem",
                borderRadius: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "var(--shadow-lg)",
                marginTop: "1.5rem",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--brand)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                  }}
                >
                  {totalCount}
                </span>
                <div style={{ fontSize: "0.95rem" }}>
                  <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Your order
                  </div>
                  <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>
                    {formatPrice(totalCents)}
                  </strong>
                </div>
              </div>
              <button type="button" onClick={() => setStep(2)} className="btn btn-light">
                Next: Pickup Time →
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: SLOTS */}
      {step === 2 && (
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>Select Pickup Time</h2>
          {loadingSlots ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Loading times...</div>
          ) : slots.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
               All pickup slots for today are full or closed. Try again tomorrow!
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
              {slots.map(slot => {
                const isSelected = selectedSlotId === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setSelectedSlotId(slot.id)}
                    style={{
                      padding: "0.75rem",
                      border: `2px solid ${isSelected ? "var(--brand)" : "var(--border)"}`,
                      background: slot.available ? (isSelected ? "var(--brand-soft)" : "white") : "var(--card-alt)",
                      borderRadius: "var(--radius-sm)",
                      textAlign: "center",
                      cursor: slot.available ? "pointer" : "not-allowed",
                      opacity: slot.available ? 1 : 0.6,
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{slot.startTime} – {slot.endTime}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {!slot.available ? "Full" : `${slot.capacity - slot.bookedCount} left`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" disabled={!selectedSlotId} onClick={() => setStep(3)}>Review Order →</button>
          </div>
        </div>
      )}

      {/* STEP 3: CONFIRM */}
      {step === 3 && (
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Review Order</h2>
          <div style={{ marginBottom: "1.5rem" }}>
             <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>Items</h3>
             <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                {Object.entries(cart).map(([id, quantity]) => {
                  const item = items.find(i => i.id === id);
                  if (!item) return null;
                  return (
                    <li key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
                       <span><span style={{ color: "var(--muted)", marginRight: "0.5rem" }}>{quantity}×</span>{item.name}</span>
                       <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatPrice(item.priceCents * quantity)}</span>
                    </li>
                  )
                })}
             </ul>
             <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                 <span>Total</span>
                 <span>{formatPrice(totalCents)}</span>
             </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
             <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>Pickup Time</h3>
             <div style={{ padding: "0.75rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>
                  {slots.find(s => s.id === selectedSlotId)?.startTime} – {slots.find(s => s.id === selectedSlotId)?.endTime}
                </strong>
                <button className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem" }} onClick={() => setStep(2)}>Change</button>
             </div>
          </div>

          <div style={{ marginBottom: "2rem" }}>
             <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "0.75rem" }}>Notes (optional)</h3>
             <textarea 
               className="input"
               placeholder="e.g., No onions please" 
               rows={2}
               value={notes}
               onChange={e => setNotes(e.target.value)}
             />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" disabled={submitting} onClick={placeOrder}>
                {submitting ? "Placing..." : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
