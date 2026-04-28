import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, auth, ctx: Ctx) => {
  const { id } = await ctx.params;
  const order = await OrderService.byId(id, auth.userId);
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(order);
});

export const PATCH = withAuth(async (req, auth, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  
  if (typeof body.status !== "string") {
    return NextResponse.json({ error: "status required", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true }
  });

  try {
    const order = await OrderService.updateStatus(id, { id: auth.userId, role: user?.role || "student" }, body.status);
    if (!order) {
      return NextResponse.json({ error: "not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (e) {
    if (e instanceof Error) {
        if (e.message === "INVALID_STATUS_TRANSITION") {
            return NextResponse.json({ error: "Invalid status transition", code: "INVALID_STATUS_TRANSITION" }, { status: 422 });
        }
        if (e.message === "FORBIDDEN") {
            return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
        }
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "invalid request", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }
});

export const DELETE = withAuth(async (_req, auth, ctx: Ctx) => {
  const { id } = await ctx.params;
  const removed = await OrderService.remove(id, auth.userId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
