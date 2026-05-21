import { decrypt as decryptLegacyPassword } from "@/lib/crypto";
import { decryptCredential } from "@/lib/credentials";
import type { Subscription } from "@/lib/subscription-types";

type SubscriptionRow = Partial<Subscription> & {
  id: string;
  login_password_ciphertext?: string | null;
  login_password_iv?: string | null;
  login_password_tag?: string | null;
};

export function serializeSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    tool: row.tool ?? "",
    subscription: row.subscription ?? "",
    due_date: row.due_date ?? "",
    price: row.price ?? "",
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
