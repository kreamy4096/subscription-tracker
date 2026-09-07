import { NextResponse } from "next/server";
import { parseBudgetMailSettingsInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { getPool, query } from "@/lib/db";

async function getBudgetSettingsPayload() {
  const settingsResult = await query(
    `SELECT id, enabled, updated_at
     FROM budget_mail_settings
     ORDER BY updated_at ASC
     LIMIT 1`,
  );
  const settings = settingsResult.rows[0];

  if (!settings) {
    throw new Error("Budget mail settings are unavailable.");
  }

  const recipientsResult = await query(
    `SELECT id, email, is_primary, is_active, sort_order, created_at, updated_at
     FROM budget_mail_recipients
     WHERE settings_id = $1
     ORDER BY sort_order ASC, created_at ASC, email ASC`,
    [settings.id],
  );

  return {
    ...settings,
    recipients: recipientsResult.rows,
  };
}

export async function GET(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    return NextResponse.json(await getBudgetSettingsPayload());
  } catch (error: unknown) {
    console.error("API Error in GET /api/budget-settings:", error);
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
    const parsed = parseBudgetMailSettingsInput(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await query("SELECT 1");
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const settingsResult = await client.query(
        `UPDATE budget_mail_settings
         SET enabled = $1, updated_at = now()
         WHERE id = (
           SELECT id FROM budget_mail_settings ORDER BY updated_at ASC LIMIT 1
         )
         RETURNING id`,
        [parsed.data.enabled],
      );
      const settingsId = settingsResult.rows[0]?.id as string | undefined;

      if (!settingsId) {
        throw new Error("Budget mail settings are unavailable.");
      }

      await client.query(
        "DELETE FROM budget_mail_recipients WHERE settings_id = $1",
        [settingsId],
      );

      for (const recipient of parsed.data.recipients) {
        await client.query(
          `INSERT INTO budget_mail_recipients (
            settings_id,
            email,
            is_primary,
            is_active,
            sort_order
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            settingsId,
            recipient.email,
            recipient.is_primary,
            recipient.is_active,
            recipient.sort_order,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json(await getBudgetSettingsPayload());
  } catch (error: unknown) {
    console.error("API Error in POST /api/budget-settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
