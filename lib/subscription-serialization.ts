import { decrypt as decryptLegacyPassword } from "@/lib/crypto";
import { decryptCredential } from "@/lib/credentials";
import {
  normalizeSubscriptionPlan,
  type Subscription,
} from "@/lib/subscription-types";

type SubscriptionRow = Omit<
  Partial<Subscription>,
  "next_due_date" | "last_top_up_date" | "statement_generation_date"
> & {
  id: string;
  next_due_date?: string | Date | null;
  last_top_up_date?: string | Date | null;
  statement_generation_date?: string | Date | null;
  login_password_ciphertext?: string | null;
  login_password_iv?: string | null;
  login_password_tag?: string | null;
};

export function serializeSubscriptionRow(row: SubscriptionRow): Subscription {
  const nextDueDate =
    row.next_due_date instanceof Date
      ? row.next_due_date.toISOString().slice(0, 10)
      : row.next_due_date;
  const lastTopUpDate =
    row.last_top_up_date instanceof Date
      ? row.last_top_up_date.toISOString().slice(0, 10)
      : row.last_top_up_date;
  const statementGenerationDate =
    row.statement_generation_date instanceof Date
      ? row.statement_generation_date.toISOString().slice(0, 10)
      : row.statement_generation_date;

  return {
    id: row.id,
    tool: row.tool ?? "",
    subscription: normalizeSubscriptionPlan(row.subscription, row.action),
    due_date: row.due_date ?? "",
    billing_type: row.billing_type ?? "one_time",
    recurrence_day: row.recurrence_day ?? null,
    next_due_date: nextDueDate ?? row.due_date ?? "",
    price: row.price ?? "",
    estimated_monthly_budget:
      row.estimated_monthly_budget ??
      (normalizeSubscriptionPlan(row.subscription, row.action) === "PAYG"
        ? row.price ?? ""
        : ""),
    last_top_up_date: lastTopUpDate ??
      (normalizeSubscriptionPlan(row.subscription, row.action) === "PAYG"
        ? row.due_date ?? ""
        : ""),
    current_balance: row.current_balance ?? "",
    payg_top_ups: Array.isArray(row.payg_top_ups) ? row.payg_top_ups : [],
    estimated_monthly_bill: row.estimated_monthly_bill ??
      (normalizeSubscriptionPlan(row.subscription, row.action) === "PAYG (Postpaid)"
        ? row.price ?? ""
        : ""),
    statement_generation_date: statementGenerationDate ??
      (normalizeSubscriptionPlan(row.subscription, row.action) === "PAYG (Postpaid)"
        ? row.due_date ?? ""
        : ""),
    bill_status: row.bill_status === "Settled" ? "Settled" : "Pending Invoice",
    bill_status_month: row.bill_status_month ?? "",
    postpaid_bills: Array.isArray(row.postpaid_bills) ? row.postpaid_bills : [],
    login_email: row.login_email ?? "",
    login_password: decryptPasswordSafely(row),
    has_login_password:
      row.has_login_password ??
      Boolean(
        row.login_password ||
          row.login_password_ciphertext ||
          row.login_password_iv ||
          row.login_password_tag,
      ),
    action: row.action ?? "",
    payment_status: row.payment_status ?? "",
    created_at: row.created_at,
  };
}

function decryptPasswordSafely(row: SubscriptionRow) {
  if (
    row.login_password_ciphertext &&
    row.login_password_iv &&
    row.login_password_tag
  ) {
    try {
      return decryptCredential({
        ciphertext: row.login_password_ciphertext,
        iv: row.login_password_iv,
        tag: row.login_password_tag,
      });
    } catch {
      return "";
    }
  }

  const normalized = row.login_password ?? "";
  if (!normalized) {
    return "";
  }

  try {
    return decryptLegacyPassword(normalized);
  } catch {
    return normalized;
  }
}
