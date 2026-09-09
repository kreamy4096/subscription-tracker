import { NextResponse } from "next/server";
import { parseSubscriptionInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { encryptCredential } from "@/lib/credentials";
import { query } from "@/lib/db";
import { serializeSubscriptionRow } from "@/lib/subscription-serialization";
import { syncAutomaticPaymentStatuses } from "@/lib/payment-status-sync";
import { syncPostpaidBillStatuses } from "@/lib/postpaid-status";

export const dynamic = "force-dynamic";

const liveDataHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function GET(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    await syncAutomaticPaymentStatuses();
    await syncPostpaidBillStatuses();

    const result = await query(
      `SELECT
        id,
        tool,
        subscription,
        due_date,
        billing_type,
        recurrence_day,
        next_due_date,
        price,
        estimated_monthly_budget,
        last_top_up_date,
        current_balance,
        payg_top_ups,
        estimated_monthly_bill,
        statement_generation_date,
        bill_status,
        bill_status_month,
        postpaid_bills,
        login_email,
        login_password,
        login_password_ciphertext,
        login_password_iv,
        login_password_tag,
        (
          COALESCE(login_password_ciphertext, '') != ''
          OR COALESCE(login_password, '') != ''
        ) AS has_login_password,
        action,
        payment_status,
        created_at
       FROM subscriptions
       ORDER BY created_at DESC`,
    );
    return NextResponse.json(
      result.rows.map((row) =>
        serializeSubscriptionRow(row as { id: string }),
      ),
      { headers: liveDataHeaders },
    );
  } catch (error: unknown) {
    console.error("API Error in GET /api/subscriptions:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: liveDataHeaders },
    );
  }
}

export async function POST(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const parsed = parseSubscriptionInput(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const {
      tool,
      subscription,
      due_date,
      billing_type,
      recurrence_day,
      next_due_date,
      price,
      estimated_monthly_budget,
      last_top_up_date,
      current_balance,
      payg_top_ups,
      estimated_monthly_bill,
      statement_generation_date,
      bill_status,
      bill_status_month,
      postpaid_bills,
      login_email,
      login_password,
      action,
      payment_status,
    } = parsed.data;

    const encryptedPassword = login_password
      ? encryptCredential(login_password)
      : null;

    const result = await query(
      `INSERT INTO subscriptions (
        tool,
        subscription,
        due_date,
        billing_type,
        recurrence_day,
        next_due_date,
        price,
        estimated_monthly_budget,
        last_top_up_date,
        current_balance,
        payg_top_ups,
        estimated_monthly_bill,
        statement_generation_date,
        bill_status,
        bill_status_month,
        postpaid_bills,
        login_email,
        login_password,
        login_password_ciphertext,
        login_password_iv,
        login_password_tag,
        action,
        payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16::jsonb, $17, NULL, $18, $19, $20, $21, $22)
      RETURNING
        id,
        tool,
        subscription,
        due_date,
        billing_type,
        recurrence_day,
        next_due_date,
        price,
        estimated_monthly_budget,
        last_top_up_date,
        current_balance,
        payg_top_ups,
        estimated_monthly_bill,
        statement_generation_date,
        bill_status,
        bill_status_month,
        postpaid_bills,
        login_email,
        login_password,
        login_password_ciphertext,
        login_password_iv,
        login_password_tag,
        (
          COALESCE(login_password_ciphertext, '') != ''
          OR COALESCE(login_password, '') != ''
        ) AS has_login_password,
        action,
        payment_status,
        created_at`,
      [
        tool,
        subscription,
        due_date,
        billing_type,
        recurrence_day,
        next_due_date || null,
        price,
        estimated_monthly_budget || null,
        last_top_up_date || null,
        current_balance || null,
        JSON.stringify(payg_top_ups),
        estimated_monthly_bill || null,
        statement_generation_date || null,
        bill_status,
        bill_status_month || null,
        JSON.stringify(postpaid_bills),
        login_email,
        encryptedPassword?.ciphertext ?? null,
        encryptedPassword?.iv ?? null,
        encryptedPassword?.tag ?? null,
        action,
        payment_status,
      ],
    );

    return NextResponse.json(
      serializeSubscriptionRow(result.rows[0] as { id: string }),
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("API Error in POST /api/subscriptions:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
