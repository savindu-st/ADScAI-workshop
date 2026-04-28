import { NextResponse, NextRequest } from "next/server";
import { SlotService } from "@/lib/services/slot";

// Public endpoint for checking slot availability
 
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Date parameter is required in YYYY-MM-DD format", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const slots = await SlotService.listAvailable(date);
    return NextResponse.json(slots);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch slots", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
