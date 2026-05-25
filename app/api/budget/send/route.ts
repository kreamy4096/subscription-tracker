import { NextResponse } from "next/server";
import { hasValidCronSecret, requireBasicAuth } from "@/lib/auth";
import { sendMonthlyBudgetReport } from "@/lib/budget-mail";

export const runtime = "nodejs";

async function handleSend(request: Request) {
  if (!hasValidCronSecret(request)) {
    const authError = requireBasicAuth(request);
    if (authError) {
      return authError;
    }
  }

  try {
    console.log("SubTrack Pro budget email run started.");
    const result = await sendMonthlyBudgetReport();
    console.log("SubTrack Pro budget email run completed.", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error("API Error in POST /api/budget/send:", error);
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
