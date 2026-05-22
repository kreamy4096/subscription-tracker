import type { Subscription } from "@/lib/subscription-types";
import { query } from "@/lib/db";

interface ReminderGroupRow {
  id: string;
  name: string;
  days_before: number;
  enabled: boolean;
}

interface ReminderRecipientRow {
  group_id: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
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

function getZohoFromAddress() {
  const fromEmail = getRequiredEnv("ZOHO_FROM_EMAIL");
  const fromName = process.env.ZOHO_FROM_NAME || "Automation Admin";
  return `"${fromName.replaceAll('"', "")}" <${fromEmail}>`;
}

function normalizeSubscription(
  item: Partial<Subscription> & { id: string },
): Subscription {
  return {
    id: item.id,
    tool: item.tool ?? "",
    subscription: item.subscription ?? "",
    due_date: item.due_date ?? "",
    billing_type: item.billing_type ?? "one_time",
    recurrence_day: item.recurrence_day ?? null,
    next_due_date: item.next_due_date ?? item.due_date ?? "",
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

  return diffInDays(today, currentCandidate);
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

function parsePriceAmount(value: string | null | undefined) {
  const numeric = Number.parseFloat((value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatReminderDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function getReminderGroups() {
  const groupsResult = await query(
    `SELECT id, name, days_before, enabled
     FROM reminder_groups
     ORDER BY created_at ASC, name ASC`,
  );
  const recipientsResult = await query(
    `SELECT group_id, email, is_primary, is_active, sort_order
     FROM reminder_recipients
     WHERE is_active = true
     ORDER BY sort_order ASC, created_at ASC, email ASC`,
  );
  const recipients = recipientsResult.rows as ReminderRecipientRow[];

  if (groupsResult.rows.length > 0) {
    return (groupsResult.rows as ReminderGroupRow[]).map((group) => ({
      id: group.id,
      name: group.name,
      daysBefore: Number(group.days_before ?? 3),
      enabled: Boolean(group.enabled),
      recipients: recipients
        .filter((recipient) => recipient.group_id === group.id)
        .map((recipient) => ({
          email: recipient.email,
          isPrimary: Boolean(recipient.is_primary),
          sortOrder: Number(recipient.sort_order ?? 0),
        })),
    }));
  }

  const settingsResult = await query(
    "SELECT email, days_before, enabled FROM reminder_settings LIMIT 1",
  );
  const row = settingsResult.rows[0] as
    | { email: string; days_before: number; enabled: boolean }
    | undefined;
  if (!row) {
    return [];
  }

  return [
    {
      id: "legacy",
      name: "Default",
      daysBefore: Number(row.days_before ?? 3),
      enabled: Boolean(row.enabled),
      recipients: row.email
        .split(",")
        .map((value, index) => ({
          email: value.trim(),
          isPrimary: index === 0,
          sortOrder: index,
        }))
        .filter((item) => item.email),
    },
  ];
}

async function getUnpaidSubscriptions() {
  const result = await query(
    `SELECT id, tool, subscription, due_date, billing_type, recurrence_day, next_due_date, price, login_email, action, payment_status, created_at
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
  const primarySubscription = subscriptions[0];
  const subscriptionCount = subscriptions.length;
  const totalAmount = subscriptions.reduce(
    (sum, item) => sum + parsePriceAmount(item.price),
    0,
  );
  const amountLabel =
    totalAmount > 0
      ? `$${totalAmount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : escapeHtml(primarySubscription?.price || "-");
  const dashboardUrl = "https://substr-ack.vercel.app/";
  const planRows = subscriptions
    .map(
      (item) => `
        <tr>
          <td class="plan-row" style="padding:12px 0;border-bottom:1px solid rgba(82,139,198,0.28);">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding-right:12px;">
                  <div class="plan-title" style="font-size:16px;line-height:22px;color:#ffffff;font-weight:700;">${escapeHtml(item.tool || "-")}</div>
                  <div class="muted-text" style="font-size:13px;line-height:20px;color:#b6c6de;">${escapeHtml(item.subscription || "Subscription")}</div>
                  <div class="status-text" style="font-size:12px;line-height:20px;color:#41d884;">${escapeHtml(item.payment_status || "Reminder pending")}</div>
                </td>
                <td width="118" align="right" valign="top">
                  <div class="amount-text" style="font-size:17px;line-height:24px;color:#ffffff;font-weight:700;">${escapeHtml(item.price || "-")}</div>
                  <div class="small-muted" style="font-size:12px;line-height:18px;color:#b6c6de;">${escapeHtml(formatReminderDate(item.next_due_date || item.due_date))}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <div style="margin:0;padding:0;background:#00152f;">
      <style>
        @media only screen and (max-width: 600px) {
          .email-outer { padding: 0 !important; }
          .email-card { width: 100% !important; border-radius: 10px !important; }
          .hero-cell { padding: 24px 18px 18px !important; }
          .hero-title { font-size: 28px !important; line-height: 34px !important; }
          .hero-subtitle { font-size: 17px !important; line-height: 24px !important; margin-top: 8px !important; }
          .section-cell { padding: 0 16px 16px !important; }
          .panel-title { font-size: 18px !important; line-height: 24px !important; }
          .body-copy { font-size: 14px !important; line-height: 22px !important; }
          .detail-label { font-size: 12px !important; line-height: 18px !important; }
          .detail-value { font-size: 20px !important; line-height: 26px !important; }
          .plan-title { font-size: 14px !important; line-height: 20px !important; }
          .muted-text { font-size: 11px !important; line-height: 18px !important; }
          .status-text { font-size: 10px !important; line-height: 18px !important; }
          .amount-text { font-size: 15px !important; line-height: 21px !important; }
          .small-muted { font-size: 10px !important; line-height: 16px !important; }
          .panel-pad { padding: 18px !important; }
          .plan-table-pad { padding: 0 18px 8px !important; }
          .cta-cell { padding: 4px 16px 22px !important; }
          .cta-button { font-size: 17px !important; line-height: 22px !important; padding: 15px 18px !important; }
          .help-cell { padding: 16px !important; }
          .footer-cell { padding: 20px 18px !important; font-size: 12px !important; line-height: 20px !important; }
        }
      </style>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#00152f;background-image:radial-gradient(circle at 50% 0,#053d72 0,#00152f 58%);font-family:Inter,Arial,sans-serif;color:#ffffff;">
        <tr>
          <td class="email-outer" align="center" style="padding:0;">
            <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;background:#031f3f;border:1px solid rgba(104,160,224,0.45);border-radius:14px;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,0.35);">
              <tr>
                <td class="hero-cell" align="center" style="padding:26px 28px 22px;background:#052448;background-image:linear-gradient(160deg,#052d59 0%,#031d3c 55%,#02172f 100%);">
                  <h1 class="hero-title" style="margin:0;font-size:34px;line-height:42px;font-weight:800;color:#ffffff;">Subscription Reminder</h1>
                  <p class="hero-subtitle" style="margin:10px 0 0;font-size:19px;line-height:28px;color:#b6c6de;">
                    ${subscriptionCount === 1 ? "Your subscription renews soon" : `${subscriptionCount} subscriptions renew soon`}
                  </p>
                </td>
              </tr>

              <tr>
                <td class="section-cell" style="padding:0 28px 20px;background:#031f3f;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#062a52;border:1px solid rgba(104,160,224,0.45);border-radius:12px;">
                    <tr>
                      <td style="padding:20px 22px;">
                        <div class="panel-title" style="font-size:22px;line-height:30px;font-weight:800;color:#ffffff;">Renewal attention needed</div>
                        <div class="body-copy" style="margin-top:6px;font-size:16px;line-height:25px;color:#d5e0ef;">Review the due subscriptions below and update payment status once handled.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td class="section-cell" style="padding:0 28px 20px;background:#031f3f;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#06264c;border:1px solid rgba(104,160,224,0.45);border-radius:12px;">
                    <tr>
                      <td class="panel-title panel-pad" colspan="3" style="padding:20px 20px 6px;font-size:20px;line-height:28px;font-weight:800;color:#ffffff;">Renewal details</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 20px 22px;">
                        <div class="detail-label" style="font-size:14px;line-height:21px;color:#b6c6de;">Renewal date</div>
                        <div class="detail-value" style="margin-top:5px;font-size:22px;line-height:30px;font-weight:800;color:#ffffff;">${escapeHtml(formatReminderDate(primarySubscription?.next_due_date || primarySubscription?.due_date))}</div>
                      </td>
                      <td width="1" style="background:rgba(182,198,222,0.45);"></td>
                      <td style="padding:14px 20px 22px;">
                        <div class="detail-label" style="font-size:14px;line-height:21px;color:#b6c6de;">Amount</div>
                        <div class="detail-value" style="margin-top:5px;font-size:22px;line-height:30px;font-weight:800;color:#ffffff;">${amountLabel}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td class="section-cell" style="padding:0 28px 20px;background:#031f3f;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#06264c;border:1px solid rgba(104,160,224,0.45);border-radius:12px;">
                    <tr>
                      <td class="panel-title" style="padding:20px 20px 2px;font-size:20px;line-height:28px;font-weight:800;color:#ffffff;">Your plan${subscriptionCount > 1 ? "s" : ""}</td>
                    </tr>
                    <tr>
                      <td class="plan-table-pad" style="padding:0 20px 8px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                          ${planRows}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td class="cta-cell" align="center" style="padding:6px 28px 26px;background:#031f3f;">
                  <a class="cta-button" href="${escapeHtml(dashboardUrl)}" style="display:block;background:#32c978;border-radius:9px;color:#ffffff;text-decoration:none;font-size:19px;line-height:24px;font-weight:800;padding:16px 20px;">Manage Subscription&nbsp; &#8594;</a>
                  <p class="muted-text" style="max-width:430px;margin:16px auto 0;font-size:14px;line-height:22px;color:#b6c6de;">Update payment status, renewal information, or plan details in SubTrack Pro.</p>
                </td>
              </tr>

              <tr>
                <td class="help-cell" style="padding:18px 28px;background:#031b37;border-top:1px solid rgba(104,160,224,0.28);border-bottom:1px solid rgba(104,160,224,0.28);">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td>
                        <div class="panel-title" style="font-size:18px;line-height:25px;font-weight:800;color:#ffffff;">Need help?</div>
                        <div class="muted-text" style="font-size:14px;line-height:22px;color:#b6c6de;">Reply to this email if any reminder detail looks incorrect.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td class="footer-cell" align="center" style="padding:24px 28px;background:#031f3f;color:#b6c6de;font-size:14px;line-height:22px;">
                  Thank you for keeping your subscriptions up to date.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>`;
}

async function sendZohoReminderEmail(
  primaryEmail: string,
  ccEmails: string[],
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
        fromAddress: getZohoFromAddress(),
        toAddress: primaryEmail,
        ...(ccEmails.length > 0 ? { ccAddress: ccEmails.join(",") } : {}),
        subject: `SubTrack Pro - You have ${subscriptions.length} subscription(s) due soon`,
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
  const groups = await getReminderGroups();
  const skipped = {
    disabledGroups: 0,
    groupsWithoutRecipients: 0,
    groupsWithoutDueSubscriptions: 0,
    subscriptionsOutsideWindow: 0,
    subscriptionsWithInvalidDates: 0,
  };

  if (groups.length === 0) {
    return { sent: 0, emailsSent: 0, skipped };
  }

  const now = new Date();
  const subscriptions = await getUnpaidSubscriptions();
  let sent = 0;
  let emailsSent = 0;

  for (const group of groups) {
    if (!group.enabled) {
      skipped.disabledGroups += 1;
      continue;
    }

    const recipientEmails = group.recipients
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((recipient) => recipient.email.trim())
      .filter(Boolean);

    if (recipientEmails.length === 0) {
      skipped.groupsWithoutRecipients += 1;
      continue;
    }

    const primaryEmail =
      group.recipients.find((recipient) => recipient.isPrimary)?.email ||
      recipientEmails[0];
    const ccEmails = recipientEmails.filter((email) => email !== primaryEmail);

    const dueSoon = subscriptions.filter((item) => {
      const trackableDueDate = item.next_due_date || item.due_date;
      const daysUntilDue = getDaysUntilDue(trackableDueDate, now);
      if (daysUntilDue === null) {
        skipped.subscriptionsWithInvalidDates += 1;
        return false;
      }

      if (daysUntilDue > group.daysBefore) {
        skipped.subscriptionsOutsideWindow += 1;
        return false;
      }

      return true;
    });

    if (dueSoon.length === 0) {
      skipped.groupsWithoutDueSubscriptions += 1;
      continue;
    }

    await sendZohoReminderEmail(primaryEmail, ccEmails, dueSoon);
    sent += dueSoon.length;
    emailsSent += 1;
  }

  return { sent, emailsSent, skipped };
}
