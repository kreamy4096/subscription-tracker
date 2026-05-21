import type { Subscription } from "@/lib/subscription-types";
import { query } from "@/lib/db";

interface ReminderSettingsRow {
  email: string;
  days_before: number;
  enabled: boolean;
}

interface ZohoAccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface ZohoAccountsResponse {
  data?: Array<{
    accountId?: string;
    primaryEmailAddress?: string;
    mailboxAddress?: string;
    emailAddress?: Array<{ mailId?: string; isPrimary?: boolean }>;
    sendMailDetails?: Array<{ fromAddress?: string; status?: boolean }>;
  }>;
  status?: {
    code?: number;
    description?: string;
  };
}

interface ZohoErrorResponse {
  data?: {
    moreInfo?: string;
  };
  status?: {
    code?: number;
    description?: string;
  };
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is missing.`);
  }
  return value;
}

function normalizeSubscription(
  item: Partial<Subscription> & { id: string },
): Subscription {
  return {
    id: item.id,
    tool: item.tool ?? "",
    subscription: item.subscription ?? "",
    due_date: item.due_date ?? "",
    price: item.price ?? "",
    login_email: item.login_email ?? "",
    has_login_password: item.has_login_password ?? false,
    action: item.action ?? "",
    payment_status: item.payment_status ?? "",
    created_at: item.created_at,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function startOfDay(value: Date) {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addMonths(value: Date, count: number) {
  const copy = new Date(value);
  copy.setMonth(copy.getMonth() + count);
  return copy;
}

function diffInDays(from: Date, to: Date) {
  return Math.floor(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

function parseDueDay(dueDate: string) {
  const trimmed = dueDate.trim();
  if (!trimmed) {
    return null;
  }

  const dayMatch = trimmed.match(/\b([0-2]?\d|3[01])(?:st|nd|rd|th)?\b/i);
  if (!dayMatch) {
    return null;
  }

  const day = Number.parseInt(dayMatch[1], 10);
  if (day < 1 || day > 31) {
    return null;
  }

  return day;
}

function getMonthlyRecurringDaysUntilDue(dueDay: number, now: Date) {
  const today = startOfDay(now);
  const year = today.getFullYear();
  const month = today.getMonth();

  const currentMonthMaxDay = new Date(year, month + 1, 0).getDate();
  const currentCandidate = new Date(
    year,
    month,
    Math.min(dueDay, currentMonthMaxDay),
  );

  if (currentCandidate >= today) {
    return diffInDays(today, currentCandidate);
  }

  const nextMonthDate = addMonths(today, 1);
  const nextMonthMaxDay = new Date(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth() + 1,
    0,
  ).getDate();
  const nextCandidate = new Date(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth(),
    Math.min(dueDay, nextMonthMaxDay),
  );

  return diffInDays(today, nextCandidate);
}

function getDaysUntilDue(dueDate: string, now: Date) {
  const parsedDate = new Date(dueDate);
  if (!Number.isNaN(parsedDate.getTime())) {
    return diffInDays(startOfDay(now), parsedDate);
  }

  const recurringDay = parseDueDay(dueDate);
  if (recurringDay === null) {
    return null;
  }

  return getMonthlyRecurringDaysUntilDue(recurringDay, now);
}

async function getReminderSettings() {
  const result = await query(
    "SELECT email, days_before, enabled FROM reminder_settings LIMIT 1",
  );
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as ReminderSettingsRow;
  return {
    email: row.email,
    daysBefore: Number(row.days_before ?? 3),
    enabled: Boolean(row.enabled),
  };
}

async function getUnpaidSubscriptions() {
  const result = await query(
    `SELECT id, tool, subscription, due_date, price, login_email, action, payment_status, created_at
     FROM subscriptions
     WHERE COALESCE(payment_status, '') != 'Paid'
     ORDER BY created_at DESC`,
  );

  return result.rows.map((row) =>
    normalizeSubscription(row as Partial<Subscription> & { id: string }),
  );
}

async function getZohoAccessToken() {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getRequiredEnv("ZOHO_CLIENT_ID"),
      client_secret: getRequiredEnv("ZOHO_CLIENT_SECRET"),
      refresh_token: getRequiredEnv("ZOHO_REFRESH_TOKEN"),
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as ZohoAccessTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Failed to refresh Zoho access token.",
    );
  }

  return data.access_token;
}

async function getZohoAccountId(accessToken: string) {
  const fromEmail = getRequiredEnv("ZOHO_FROM_EMAIL").toLowerCase();
  const response = await fetch("https://mail.zoho.com/api/accounts", {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as ZohoAccountsResponse & ZohoErrorResponse;

  if (!response.ok) {
    throw new Error(
      data.data?.moreInfo ||
        data.status?.description ||
        "Failed to retrieve Zoho sender account ID.",
    );
  }

  const matchingAccount = data.data?.find((account) => {
    const directEmails = [
      account.primaryEmailAddress,
      account.mailboxAddress,
      ...(account.emailAddress?.map((email) => email.mailId) ?? []),
      ...(account.sendMailDetails
        ?.filter((detail) => detail.status !== false)
        .map((detail) => detail.fromAddress) ?? []),
    ]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());

    return directEmails.includes(fromEmail);
  });

  const fallbackAccount = data.data?.[0];
  const accountId = matchingAccount?.accountId || fallbackAccount?.accountId;

  if (!accountId) {
    throw new Error(
      "Failed to retrieve Zoho sender account ID. Check that ZOHO_FROM_EMAIL belongs to the authenticated Zoho Mail account.",
    );
  }

  return accountId;
}

function buildReminderEmail(subscriptions: Subscription[]) {
  const rows = subscriptions
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.tool || "-")}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.due_date || "-")}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.price || "-")}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.payment_status || "-")}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#f8f9fa;padding:24px;color:#191c1d;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <div style="background:#6366f1;padding:24px 28px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">SubTrack Pro</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">Subscriptions Due Soon</h1>
        </div>
        <div style="padding:24px 28px;">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
            You have <strong>${subscriptions.length}</strong> subscription(s) that need attention soon.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f3f4f6;text-align:left;">
                <th style="padding:12px 16px;">Tool</th>
                <th style="padding:12px 16px;">Due Date</th>
                <th style="padding:12px 16px;">Price</th>
                <th style="padding:12px 16px;">Payment Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:#556068;">
            Log in to SubTrack Pro to mark as paid.
          </p>
        </div>
      </div>
    </div>`;
}

async function sendZohoReminderEmail(
  recipientEmail: string,
  subscriptions: Subscription[],
) {
  const accessToken = await getZohoAccessToken();
  const accountId = await getZohoAccountId(accessToken);
  const response = await fetch(
    `https://mail.zoho.com/api/accounts/${accountId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromAddress: getRequiredEnv("ZOHO_FROM_EMAIL"),
        toAddress: recipientEmail,
        subject: `SubTrack Pro — You have ${subscriptions.length} subscription(s) due soon`,
        content: buildReminderEmail(subscriptions),
        mailFormat: "html",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send Zoho reminder email: ${body}`);
  }
}

export async function sendDueReminders() {
  const settings = await getReminderSettings();
  if (!settings || !settings.enabled || !settings.email) {
    return { sent: 0 };
  }

  const now = new Date();
  const subscriptions = await getUnpaidSubscriptions();
  const dueSoon = subscriptions.filter((item) => {
    const daysUntilDue = getDaysUntilDue(item.due_date, now);
    return (
      daysUntilDue !== null &&
      daysUntilDue >= 0 &&
      daysUntilDue <= settings.daysBefore
    );
  });

  if (dueSoon.length === 0) {
    return { sent: 0 };
  }

  await sendZohoReminderEmail(settings.email, dueSoon);
  return { sent: dueSoon.length };
}
