import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(
      "SELECT * FROM subscriptions ORDER BY created_at DESC",
    );
    return NextResponse.json(result.rows);
  } catch (error: unknown) {
    console.error("API Error in GET /api/subscriptions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      tool,
      subscription,
      due_date,
      price,
      login_email,
      login_password,
      action,
      payment_status,
    } = body;

    if (!tool) {
      return NextResponse.json(
        { error: "Tool name is required" },
        { status: 400 },
      );
    }

    const result = await query(
      `INSERT INTO subscriptions (
        tool, subscription, due_date, price, login_email, login_password, action, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        tool,
        subscription || "",
        due_date || "",
        price || "",
        login_email || "",
        login_password || "",
        action || "",
        payment_status || "",
      ],
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    console.error("API Error in POST /api/subscriptions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
