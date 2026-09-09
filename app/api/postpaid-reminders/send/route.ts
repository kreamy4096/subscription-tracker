import { NextResponse } from "next/server";
import { hasValidCronSecret, requireBasicAuth } from "@/lib/auth";
import { sendPendingPostpaidReminder } from "@/lib/postpaid-reminders";

export const runtime = "nodejs";

async function handleSend(request: Request) {
  if (!hasValidCronSecret(request)) {
    const authError = requireBasicAuth(request);
    if (authError) return authError;
  }

  try {
    return NextResponse.json({
      success: true,
      ...(await sendPendingPostpaidReminder()),
    });
  } catch (error) {
    console.error("Postpaid bill reminder failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleSend(request);
}

export async function POST(request: Request) {
  return handleSend(request);
}
