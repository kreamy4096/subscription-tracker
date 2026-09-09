import { NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth";
import { getPostpaidReminderStatus } from "@/lib/postpaid-reminders";

export async function GET(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) return authError;

  try {
    return NextResponse.json(await getPostpaidReminderStatus());
  } catch (error) {
    console.error("Postpaid reminder status failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
