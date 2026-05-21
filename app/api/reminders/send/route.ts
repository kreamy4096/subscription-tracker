import { NextResponse } from "next/server";
import { hasValidCronSecret, requireBasicAuth } from "@/lib/auth";
import { sendDueReminders } from "@/lib/reminders";

export const runtime = "nodejs";

async function handleSend(request: Request) {
  if (!hasValidCronSecret(request)) {
    const authError = requireBasicAuth(request);
    if (authError) {
      return authError;
    }
  }

  try {
    const result = await sendDueReminders();
    return NextResponse.json({ success: true, sent: result.sent });
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminders/send:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(request: Request) {
  return handleSend(request);
}
