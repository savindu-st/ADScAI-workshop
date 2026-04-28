"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Order = any; // Simplify for now

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") return "badge badge-pending";
  if (s === "preparing") return "badge badge-ready";
  if (s === "ready") return "badge badge-success";
  if (s === "picked_up" || s === "collected" || s === "completed") return "badge badge-collected";
  if (s === "cancelled" || s === "canceled") return "badge badge-cancelled";
  return "badge";
}

export function OrdersClient({ orders, userEmail }: { orders: Order[], userEmail: string }) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
      setCancellingId(id);
      try {
          await fetch(`/api/orders/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "cancelled" })
          });
          router.refresh();
      } catch (e) {
          console.error("Failed to cancel order", e);
      } finally {
          setCancellingId(null);
      }
  };

  return (
    <section>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Your orders</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{userEmail}</strong>.
        </p>
      </div>

      {orders.length === 0 && (
        <div
          className="card"
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }} aria-hidden>
            🍽
          </div>
          <h3 style={{ margin: "0 0 0.4rem" }}>No orders yet</h3>
          <p style={{ color: "var(--muted)", margin: "0 0 1rem", fontSize: "0.9rem" }}>
            Browse the menu and place your first pre-order.
          </p>
          <a href="/order" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Pre-order now
          </a>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {orders.map((order) => (
          <article key={order.id} className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                marginBottom: "0.85rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Order
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: 2 }}>
                  <strong style={{ fontSize: "1.05rem", fontVariantNumeric: "tabular-nums" }}>
                    #{order.id.slice(-6).toUpperCase()}
                  </strong>
                  <span className={badgeClass(order.status)}>{order.status}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 3 }}>
                  Placed: {formatDate(order.createdAt)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Total
                </div>
                <strong style={{ fontSize: "1.15rem", fontVariantNumeric: "tabular-nums" }}>
                  {formatPrice(order.totalCents)}
                </strong>
              </div>
            </header>
            
            {order.pickupSlot && (
                <div style={{ background: "var(--card-alt)", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Pickup Time</div>
                        <strong style={{ fontSize: "0.95rem" }}>{order.pickupSlot.date} @ {order.pickupSlot.startTime} – {order.pickupSlot.endTime}</strong>
                    </div>
                </div>
            )}

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem" }}>
              {order.items.map((it: any) => (
                <li
                  key={it.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.9rem",
                  }}
                >
                  <span>
                    <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums", marginRight: "0.5rem" }}>
                      {it.quantity}×
                    </span>
                    {it.menuItem.name}
                  </span>
                  <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(it.unitPriceCents * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  marginTop: "0.85rem",
                  marginBottom: 0,
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <strong style={{ color: "var(--text)" }}>Notes:</strong> {order.notes}
              </p>
            )}
            {order.status === "pending" && (
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", textAlign: "right" }}>
                   <button 
                       className="btn btn-ghost" 
                       style={{ color: "var(--danger)" }}
                       disabled={cancellingId === order.id}
                       onClick={() => handleCancel(order.id)}
                   >
                       {cancellingId === order.id ? "Cancelling..." : "Cancel Order"}
                   </button>
                </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
