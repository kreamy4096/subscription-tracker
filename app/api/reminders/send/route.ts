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
    console.log("SubTrack Pro reminder scan started.");
    const result = await sendDueReminders();
    console.log("SubTrack Pro reminder scan completed.", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminders/send:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleSend(request);
}

export async function POST(request: Request) {
  return handleSend(request);
}
