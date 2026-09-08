import "server-only";

import { query } from "@/lib/db";
import {
  addBillingCycle,
  getAutomaticPaymentStatus,
  isValidDateInput,
  normalizeBillingType,
  shouldAutomaticallySettle,
} from "@/lib/subscription-dates";

function toDateInput(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return typeof value === "string" ? value.slice(0, 10) : "";
}

export async function syncAutomaticPaymentStatuses(now = new Date()) {
  const result = await query(
    `SELECT
       id,
       subscription,
       billing_type,
       next_due_date,
       due_date,
       payment_status,
       status_changed_at,
       auto_paid_at
     FROM subscriptions
     WHERE COALESCE(action, '') != 'FREE'
       AND COALESCE(subscription, '') != 'Free'`,
  );

  let movedToNotPaid = 0;
  let movedToPaid = 0;
  let advancedCycles = 0;

  for (const row of result.rows) {
    const currentStatus = String(row.payment_status ?? "");

    if (currentStatus === "Not Paid") {
      if (
        shouldAutomaticallySettle(
          currentStatus,
          row.status_changed_at,
          now,
        )
      ) {
        const billingType = normalizeBillingType(row.billing_type);
        const currentDueDate =
          toDateInput(row.next_due_date) || toDateInput(row.due_date);
        const shouldAdvance =
          row.subscription !== "PAYG" &&
          billingType !== "one_time" &&
          isValidDateInput(currentDueDate);
        const nextDueDate = shouldAdvance
          ? addBillingCycle(currentDueDate, billingType)
          : null;

        await query(
          `UPDATE subscriptions
           SET payment_status = 'Paid',
               status_changed_at = $1,
               auto_paid_at = $1,
               next_due_date = CASE WHEN $2::date IS NULL THEN next_due_date ELSE $2::date END,
               due_date = CASE WHEN $2::date IS NULL THEN due_date ELSE $2 END
           WHERE id = $3`,
          [now, nextDueDate, row.id],
        );

        movedToPaid += 1;
        if (shouldAdvance) {
          advancedCycles += 1;
        }
      }

      continue;
    }

    if (row.subscription === "PAYG") {
      continue;
    }

    if (
      normalizeBillingType(row.billing_type) === "one_time" &&
      row.auto_paid_at
    ) {
      continue;
    }

    const dueDate = toDateInput(row.next_due_date) || toDateInput(row.due_date);
    const nextStatus = getAutomaticPaymentStatus(dueDate, currentStatus, now);

    if (nextStatus !== currentStatus) {
      await query(
        `UPDATE subscriptions
         SET payment_status = $1,
             status_changed_at = $2,
             auto_paid_at = CASE WHEN $1 = 'Not Paid' THEN NULL ELSE auto_paid_at END
         WHERE id = $3`,
        [nextStatus, now, row.id],
      );

      if (nextStatus === "Not Paid") {
        movedToNotPaid += 1;
      }
    }
  }

  return { movedToNotPaid, movedToPaid, advancedCycles };
}
