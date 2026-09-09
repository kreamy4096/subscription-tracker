import "server-only";

import {
  getBudgetMailDelivery,
  sendZohoHtmlEmail,
} from "@/lib/budget-mail";
import {
  isThreeDaysBeforeBudgetSend,
} from "@/lib/budget-schedule";
import { query } from "@/lib/db";
import { syncPostpaidBillStatuses } from "@/lib/postpaid-status";

interface PendingPostpaidSubscription {
  id: string;
  tool: string;
  statement_generation_date: string | Date | null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getPendingPostpaidSubscriptions() {
  const result = await query(
    `SELECT id, tool, statement_generation_date
     FROM subscriptions
     WHERE subscription = 'PAYG (Postpaid)'
       AND COALESCE(action, '') != 'Canceled'
       AND COALESCE(bill_status, 'Pending Invoice') = 'Pending Invoice'
     ORDER BY tool ASC`,
  );

  return result.rows as PendingPostpaidSubscription[];
}

export async function getPostpaidReminderStatus(referenceDate = new Date()) {
  await syncPostpaidBillStatuses(referenceDate);
  const delivery = await getBudgetMailDelivery();
  const isReminderDay =
    delivery.enabled &&
    isThreeDaysBeforeBudgetSend(delivery.send_day, referenceDate);
  const pending = isReminderDay
    ? await getPendingPostpaidSubscriptions()
    : [];

  return {
    active: isReminderDay && pending.length > 0,
    reminderDay: isReminderDay,
    sendDay: delivery.send_day,
    pending: pending.map((item) => ({ id: item.id, tool: item.tool })),
  };
}

export async function sendPendingPostpaidReminder(referenceDate = new Date()) {
  const status = await getPostpaidReminderStatus(referenceDate);
  if (!status.active) {
    return {
      sent: 0,
      emailsSent: 0,
      skipped: status.reminderDay ? "no_pending_bills" : "not_reminder_day",
    };
  }

  const delivery = await getBudgetMailDelivery();
  const orderedEmails = [...delivery.recipients]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((recipient) => recipient.email.trim())
    .filter(Boolean);
  if (orderedEmails.length === 0) {
    return { sent: 0, emailsSent: 0, skipped: "no_recipients" };
  }

  const primaryEmail =
    delivery.recipients.find((recipient) => recipient.is_primary)?.email ||
    orderedEmails[0];
  const ccEmails = orderedEmails.filter((email) => email !== primaryEmail);
  const rows = status.pending
    .map(
      (item) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;padding:15px 16px;border-radius:11px;background:#fff7ed;border:1px solid #fed7aa;"><strong style="color:#7c2d12;">${escapeHtml(item.tool)}</strong><span style="font-size:12px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:.06em;">Pending invoice</span></div>`,
    )
    .join("");

  await sendZohoHtmlEmail(
    primaryEmail,
    ccEmails,
    "Action Required: Update your Postpaid Bills",
    `<div style="margin:0;padding:24px;background:#fff7ed;font-family:Inter,Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;overflow:hidden;background:#ffffff;border:1px solid #fed7aa;border-radius:16px;box-shadow:0 20px 55px rgba(124,45,18,.12);">
        <div style="padding:29px 32px;background:#c2410c;background-image:linear-gradient(135deg,#9a3412,#ea580c);color:#ffffff;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ffedd5;">SubTrack Pro</div>
          <h1 style="margin:10px 0 9px;font-size:29px;line-height:1.2;">Action Required: Update your Postpaid Bills</h1>
          <p style="margin:0;color:#ffedd5;line-height:1.55;">Your monthly budget report is scheduled in three days.</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 18px;line-height:1.65;color:#4b5563;">Add the actual invoice amount for the pending subscriptions below so the report can use exact figures instead of a forecast.</p>
          ${rows}
          <a href="https://substr-ack.vercel.app/" style="display:block;margin-top:22px;padding:15px 20px;border-radius:10px;background:#ea580c;color:#ffffff;text-align:center;text-decoration:none;font-weight:800;">Update postpaid bills</a>
        </div>
        <div style="padding:18px 32px;border-top:1px solid #f3e2d5;background:#fffaf6;color:#7b685b;font-size:12px;text-align:center;">This reminder was generated automatically by SubTrack Pro.</div>
      </div>
    </div>`,
  );

  return { sent: status.pending.length, emailsSent: 1 };
}
