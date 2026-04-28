import { NextResponse } from "next/server";
import { MenuService } from "@/lib/services/menu";

// Public endpoint — the menu is intentionally readable without auth. This is
// the documented escape hatch from the canteen-route-protection skill and
// requires reviewer sign-off in CLAUDE.md.
 
export async function GET() {
  const items = await MenuService.list();
  return NextResponse.json(items);
}
