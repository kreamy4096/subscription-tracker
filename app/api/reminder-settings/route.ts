import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query("SELECT * FROM reminder_settings LIMIT 1");
    if (result.rows.length === 0) {
      const insertResult = await query(
        `INSERT INTO reminder_settings (email, days_before, enabled)
         VALUES ($1, $2, $3) RETURNING *`,
        ["admin@apollo.io", 3, true],
      );
      return NextResponse.json(insertResult.rows[0]);
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error("API Error in GET /api/reminder-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, days_before, enabled } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const checkResult = await query("SELECT id FROM reminder_settings LIMIT 1");

    let result;
    if (checkResult.rows.length > 0) {
      const id = checkResult.rows[0].id;
      result = await query(
        `UPDATE reminder_settings SET
          email = $1,
          days_before = $2,
          enabled = $3,
          updated_at = now()
         WHERE id = $4 RETURNING *`,
        [email, parseInt(days_before, 10) || 3, enabled !== false, id],
      );
    } else {
      result = await query(
        `INSERT INTO reminder_settings (email, days_before, enabled)
         VALUES ($1, $2, $3) RETURNING *`,
        [email, parseInt(days_before, 10) || 3, enabled !== false],
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminder-settings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
