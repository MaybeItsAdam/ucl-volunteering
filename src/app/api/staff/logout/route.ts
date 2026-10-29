import { NextResponse } from "next/server";
import { clearStaffCookie } from "@/lib/staff";

export async function POST() {
  await clearStaffCookie();
  return NextResponse.json({ ok: true });
}
