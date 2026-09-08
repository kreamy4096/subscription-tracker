import { NextResponse } from "next/server";
import { parseSubscriptionInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { encryptCredential } from "@/lib/credentials";
import { query } from "@/lib/db";
import { serializeSubscriptionRow } from "@/lib/subscription-serialization";
import { addBillingCycle, getAutomaticPaymentStatus } from "@/lib/subscription-dates";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const { id } = await params;
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
      login_email,
      login_password,
      action,
      payment_status,
    } = parsed.data;

    const encryptedPassword = login_password
      ? encryptCredential(login_password)
      : null;

    const existingResult = await query(
      "SELECT payment_status, billing_type, next_due_date, due_date FROM subscriptions WHERE id = $1",
      [id],
    );

    if (existingResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    const existing = existingResult.rows[0] as {
      payment_status?: string | null;
      billing_type?: "one_time" | "monthly" | "yearly" | null;
      next_due_date?: string | Date | null;
      due_date?: string | null;
    };
    const nextDueDateValue =
      typeof existing.next_due_date === "string"
        ? existing.next_due_date.slice(0, 10)
        : existing.next_due_date instanceof Date
          ? existing.next_due_date.toISOString().slice(0, 10)
          : existing.due_date || next_due_date;
    const shouldAdvanceRecurringCycle =
      payment_status === "Paid" &&
      existing.payment_status !== "Paid" &&
      billing_type !== "one_time" && subscription !== "PAYG";
    const savedNextDueDate = shouldAdvanceRecurringCycle
      ? addBillingCycle(nextDueDateValue || next_due_date || due_date, billing_type)
      : next_due_date;
    const savedDueDate = shouldAdvanceRecurringCycle ? savedNextDueDate : due_date;
    const savedPaymentStatus = subscription === "PAYG"
      ? payment_status
      : shouldAdvanceRecurringCycle
      ? "Paid"
      : payment_status === "Paid"
        ? getAutomaticPaymentStatus(
            next_due_date || due_date,
            payment_status,
          )
        : payment_status;

    const result = await query(
      `UPDATE subscriptions SET
        tool = $1,
        subscription = $2,
        due_date = $3,
        billing_type = $4,
        recurrence_day = $5,
        next_due_date = $6,
        price = $7,
        estimated_monthly_budget = $8,
        last_top_up_date = $9,
        current_balance = $10,
        payg_top_ups = $11::jsonb,
        login_email = $12,
        login_password = CASE WHEN $13::text IS NULL THEN login_password ELSE NULL END,
        login_password_ciphertext = COALESCE($13, login_password_ciphertext),
        login_password_iv = COALESCE($14, login_password_iv),
        login_password_tag = COALESCE($15, login_password_tag),
        action = $16,
        status_changed_at = CASE
          WHEN payment_status IS DISTINCT FROM $17 THEN now()
          ELSE status_changed_at
        END,
        auto_paid_at = CASE
          WHEN due_date IS DISTINCT FROM $3
            OR next_due_date IS DISTINCT FROM $6::date THEN NULL
          WHEN payment_status IS DISTINCT FROM $17 AND $17 = 'Not Paid' THEN NULL
          WHEN payment_status = 'Not Paid' AND $17 = 'Paid' THEN now()
          ELSE auto_paid_at
        END,
        payment_status = $17
      WHERE id = $18
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
        savedDueDate,
        billing_type,
        recurrence_day,
        savedNextDueDate || null,
        price,
        estimated_monthly_budget || null,
        last_top_up_date || null,
        current_balance || null,
        JSON.stringify(payg_top_ups),
        login_email,
        encryptedPassword?.ciphertext ?? null,
        encryptedPassword?.iv ?? null,
        encryptedPassword?.tag ?? null,
        action,
        savedPaymentStatus,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      serializeSubscriptionRow(result.rows[0] as { id: string }),
    );
  } catch (error: unknown) {
    console.error("API Error in PUT /api/subscriptions/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const { id } = await params;
    const result = await query(
      `DELETE FROM subscriptions
       WHERE id = $1
       RETURNING id, tool, subscription, due_date, billing_type, recurrence_day, next_due_date, price, estimated_monthly_budget, last_top_up_date, current_balance, payg_top_ups, login_email, action, payment_status, created_at`,
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Subscription deleted successfully",
      deleted: serializeSubscriptionRow(result.rows[0] as { id: string }),
    });
  } catch (error: unknown) {
    console.error("API Error in DELETE /api/subscriptions/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
