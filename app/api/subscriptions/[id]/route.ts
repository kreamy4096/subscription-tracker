import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      `UPDATE subscriptions SET
        tool = $1,
        subscription = $2,
        due_date = $3,
        price = $4,
        login_email = $5,
        login_password = $6,
        action = $7,
        payment_status = $8
      WHERE id = $9 RETURNING *`,
      [
        tool,
        subscription || "",
        due_date || "",
        price || "",
        login_email || "",
        login_password || "",
        action || "",
        payment_status || "",
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
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await query(
      "DELETE FROM subscriptions WHERE id = $1 RETURNING *",
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
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
