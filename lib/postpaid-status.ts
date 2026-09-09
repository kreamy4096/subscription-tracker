import "server-only";

import { getLagosMonthKey } from "@/lib/budget-schedule";
import { query } from "@/lib/db";

export async function syncPostpaidBillStatuses(referenceDate = new Date()) {
  const monthKey = getLagosMonthKey(referenceDate);
  const result = await query(
    `UPDATE subscriptions
     SET bill_status = 'Pending Invoice',
         bill_status_month = $1
     WHERE subscription = 'PAYG (Postpaid)'
       AND COALESCE(bill_status_month, '') != $1
     RETURNING id`,
    [monthKey],
  );

  return result.rowCount ?? 0;
}
