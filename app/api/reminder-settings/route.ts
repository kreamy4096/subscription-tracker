import { NextResponse } from "next/server";
import { parseReminderSettingsInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const result = await query(
      "SELECT id, email, days_before, enabled, updated_at FROM reminder_settings LIMIT 1",
    );
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
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const parsed = parseReminderSettingsInput(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { email, days_before, enabled } = parsed.data;
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
        [email, days_before, enabled, id],
      );
    } else {
      result = await query(
        `INSERT INTO reminder_settings (email, days_before, enabled)
         VALUES ($1, $2, $3) RETURNING *`,
        [email, days_before, enabled],
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminder-settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
