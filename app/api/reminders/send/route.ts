import { NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";

export const runtime = "nodejs";

async function handleSend() {
  try {
    const result = await sendDueReminders();
    return NextResponse.json({ success: true, sent: result.sent });
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminders/send:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handleSend();
}

export async function POST() {
  return handleSend();
}
