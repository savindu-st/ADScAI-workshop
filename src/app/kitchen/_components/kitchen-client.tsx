"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type OrderItem = {
    name: string;
    quantity: number;
};

type Order = {
    id: string;
    userName: string;
    status: string;
    items: OrderItem[];
    notes: string | null;
    createdAt: string;
};

type Slot = {
    id: string;
    startTime: string;
    endTime: string;
};

type SlotOrders = {
    slot: Slot;
    orders: Order[];
};

export function KitchenClient() {
    const router = useRouter();
    const [slots, setSlots] = useState<SlotOrders[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOrders = async () => {
        try {
            const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            const res = await fetch(`/api/slots/${todayStr}/orders`);
            if (!res.ok) {
                if (res.status === 403) router.push("/");
                throw new Error("Failed to load orders");
            }
            const data = await res.json();
            if (Array.isArray(data)) setSlots(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error loading orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 30000); // 30 sec poll
        return () => clearInterval(interval);
    }, [router]);

    const updateStatus = async (orderId: string, status: string) => {
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status })
            });
            if (res.ok) fetchOrders();
        } catch (e) {
            console.error("Failed to update status", e);
        }
    };

    if (loading && slots.length === 0) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Loading kitchen dashboard...</div>;

    const actionText: Record<string, string> = {
        "pending": "Start Preparing",
        "preparing": "Mark Ready",
        "ready": "Confirm Pickup"
    };

    const nextStatus: Record<string, string> = {
        "pending": "preparing",
        "preparing": "ready",
        "ready": "picked_up"
    };

    const statusBadgeClass = (s: string) => {
        if (s === "pending") return "badge-pending";
        if (s === "preparing") return "badge-ready"; // Blue-ish in a real app
        if (s === "ready") return "badge-success";
        return "";
    };

    return (
        <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <h1 style={{ fontSize: "2rem", margin: 0 }}>Kitchen Dashboard</h1>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Auto-refreshes every 30s</span>
            </div>

            {error && <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</div>}

            {slots.length === 0 ? (
                <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
                    No active pre-orders for today.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    {slots.map(slotGroup => (
                        <div key={slotGroup.slot.id} className="card">
                            <div style={{ background: "var(--card-alt)", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)", borderTopLeftRadius: "var(--radius)", borderTopRightRadius: "var(--radius)" }}>
                                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{slotGroup.slot.startTime} – {slotGroup.slot.endTime}</h2>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1px", background: "var(--border)" }}>
                                {slotGroup.orders.map(order => (
                                    <div key={order.id} style={{ background: "white", padding: "1.25rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                                            <strong style={{ fontSize: "1.05rem" }}>{order.userName}</strong>
                                            <span className={`badge ${statusBadgeClass(order.status)}`} style={{ background: "var(--card-alt)", padding: "0.25rem 0.5rem" }}>{order.status}</span>
                                        </div>
                                        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem", marginBottom: "1rem" }}>
                                            {order.items.map((item, idx) => (
                                                <li key={idx} style={{ display: "flex", gap: "0.5rem", fontSize: "0.95rem" }}>
                                                    <strong style={{ color: "var(--muted)" }}>{item.quantity}×</strong>
                                                    <span>{item.name}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {order.notes && (
                                            <p style={{ margin: "0 0 1rem 0", padding: "0.5rem", background: "var(--warning-soft)", color: "var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem" }}>
                                                <strong>Notes:</strong> {order.notes}
                                            </p>
                                        )}
                                        {nextStatus[order.status] && (
                                            <button 
                                                className="btn btn-primary" 
                                                style={{ width: "100%" }}
                                                onClick={() => updateStatus(order.id, nextStatus[order.status])}
                                            >
                                                {actionText[order.status]}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
