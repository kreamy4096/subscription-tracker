import { NextResponse } from "next/server";
import { parseSubscriptionInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { encryptCredential } from "@/lib/credentials";
import { query } from "@/lib/db";

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
      price,
      login_email,
      login_password,
      action,
      payment_status,
    } = parsed.data;

    const encryptedPassword = login_password
      ? encryptCredential(login_password)
      : null;

    const result = await query(
      `UPDATE subscriptions SET
        tool = $1,
        subscription = $2,
        due_date = $3,
        price = $4,
        login_email = $5,
        login_password = CASE WHEN $6::text IS NULL THEN login_password ELSE NULL END,
        login_password_ciphertext = COALESCE($6, login_password_ciphertext),
        login_password_iv = COALESCE($7, login_password_iv),
        login_password_tag = COALESCE($8, login_password_tag),
        action = $9,
        payment_status = $10
      WHERE id = $11
      RETURNING
        id,
        tool,
        subscription,
        due_date,
        price,
        login_email,
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
        price,
        login_email,
        encryptedPassword?.ciphertext ?? null,
        encryptedPassword?.iv ?? null,
        encryptedPassword?.tag ?? null,
        action,
        payment_status,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(result.rows[0]);
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
       RETURNING id, tool, subscription, due_date, price, login_email, action, payment_status, created_at`,
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
      deleted: result.rows[0],
    });
  } catch (error: unknown) {
    console.error("API Error in DELETE /api/subscriptions/[id]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
