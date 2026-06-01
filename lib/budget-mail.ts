import "server-only";

import { buildMonthSummary, formatCurrency, getBudgetReport } from "@/lib/budget";
import { query } from "@/lib/db";
import type { Subscription } from "@/lib/subscription-types";

interface ReminderGroupRow {
  id: string;
  name: string;
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
    emailAddress?: Array<{ mailId?: string }>;
    sendMailDetails?: Array<{ fromAddress?: string; status?: boolean }>;
  }>;
  status?: {
    description?: string;
  };
}

interface ZohoErrorResponse {
  data?: {
    moreInfo?: string;
  };
  status?: {
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
  const fromName = process.env.ZOHO_FROM_NAME || "SubTrack Pro";
  return `"${fromName.replaceAll('"', "")}" <${fromEmail}>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDueDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

  const accountId = matchingAccount?.accountId || data.data?.[0]?.accountId;
  if (!accountId) {
    throw new Error(
      "Failed to retrieve Zoho sender account ID. Check that ZOHO_FROM_EMAIL belongs to the authenticated Zoho Mail account.",
    );
  }

  return accountId;
}

async function getAllSubscriptions() {
  const result = await query(
    `SELECT
      id,
      tool,
      subscription,
      due_date,
      billing_type,
      recurrence_day,
      next_due_date,
      price,
      login_email,
      action,
      payment_status,
      created_at
     FROM subscriptions
     ORDER BY created_at DESC`,
  );

  return result.rows as Subscription[];
}

async function getBudgetRecipients() {
  const groupsResult = await query(
    `SELECT id, name, enabled
     FROM reminder_groups
     ORDER BY created_at ASC, name ASC`,
  );
  const recipientsResult = await query(
    `SELECT group_id, email, is_primary, is_active, sort_order
     FROM reminder_recipients
     WHERE is_active = true
     ORDER BY sort_order ASC, created_at ASC, email ASC`,
  );

  const groups = groupsResult.rows as ReminderGroupRow[];
  const recipients = recipientsResult.rows as ReminderRecipientRow[];

  return groups
    .filter((group) => group.enabled)
    .map((group) => ({
      id: group.id,
      name: group.name,
      recipients: recipients.filter((recipient) => recipient.group_id === group.id),
    }))
    .filter((group) => group.recipients.length > 0);
}

function buildRows(
  items: ReturnType<typeof buildMonthSummary>["items"],
  emptyLabel: string,
) {
  if (items.length === 0) {
    return `
      <div style="border:1px solid #e6e8ee;border-radius:14px;background:#ffffff;padding:16px;color:#637083;">
        ${escapeHtml(emptyLabel)}
      </div>`;
  }

  return items
    .map(
      (item) => `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e6e8ee;border-radius:14px;background:#ffffff;margin-bottom:12px;">
          <tr>
            <td style="padding:16px 16px 8px;font-size:18px;line-height:24px;color:#111827;font-weight:700;">
              ${escapeHtml(item.tool)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:0 0 10px;font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Plan</td>
                  <td style="padding:0 0 10px;font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Due Date</td>
                  <td align="right" style="padding:0 0 10px;font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Price</td>
                </tr>
                <tr>
                  <td style="padding:0;font-size:15px;line-height:22px;color:#475569;">${escapeHtml(item.subscription || "-")}</td>
                  <td style="padding:0;font-size:15px;line-height:22px;color:#475569;">${escapeHtml(formatDueDate(item.dueDate))}</td>
                  <td align="right" style="padding:0;font-size:15px;line-height:22px;color:#111827;font-weight:700;">${escapeHtml(item.price || formatCurrency(item.amount))}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`,
    )
    .join("");
}

function buildBudgetEmail(subscriptions: Subscription[], referenceDate: Date) {
  const report = getBudgetReport(subscriptions, referenceDate);
  const currentMonthItems = buildRows(
    report.currentMonth.items,
    "No scheduled subscription charges for this month.",
  );
  const previousMonthItems = buildRows(
    report.previousMonth.items,
    "No tracked subscription charges for last month.",
  );
  const changeLabel =
    report.changePercent === null
      ? "No prior month comparison available yet."
      : `${report.changePercent >= 0 ? "+" : ""}${report.changePercent.toFixed(1)}% month over month`;

  return {
    subject: `SubTrack Pro - ${report.previousMonth.label} recap and ${report.currentMonth.label} budget`,
    html: `
      <div style="margin:0;padding:24px;background:#eef2ff;font-family:Inter,Arial,sans-serif;color:#111827;">
        <style>
          @media only screen and (max-width: 600px) {
            .budget-shell { padding: 0 !important; }
            .budget-card { width: 100% !important; border-radius: 12px !important; }
            .budget-hero { padding: 24px 18px !important; }
            .budget-section { padding: 18px !important; }
            .budget-stack, .budget-stack tbody, .budget-stack tr, .budget-stack td { display: block !important; width: 100% !important; }
            .budget-stack td { padding: 0 0 12px !important; }
            .budget-kpi { margin-bottom: 12px !important; }
            .budget-copy { font-size: 14px !important; line-height: 22px !important; }
          }
        </style>
        <div class="budget-shell" style="max-width:860px;margin:0 auto;">
        <div class="budget-card" style="max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ff;border-radius:20px;overflow:hidden;box-shadow:0 25px 60px rgba(79,70,229,0.12);">
          <div class="budget-hero" style="background:#6366f1;padding:28px 32px;color:#ffffff;">
            <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">SubTrack Pro Budget</div>
            <h1 style="margin:10px 0 0;font-size:30px;line-height:1.2;">Monthly spend recap and forecast</h1>
            <p class="budget-copy" style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#e0e7ff;">
              ${escapeHtml(report.previousMonth.label)} closed at <strong>${escapeHtml(formatCurrency(report.previousMonth.total))}</strong>.
              ${escapeHtml(report.currentMonth.label)} is currently forecast at <strong>${escapeHtml(formatCurrency(report.currentMonth.total))}</strong>.
            </p>
          </div>

          <div class="budget-section" style="padding:28px 32px 12px;">
            <table class="budget-stack" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 14px;">
              <tr>
                <td class="budget-kpi" style="padding-right:14px;">
                  <div style="border:1px solid #e5e7eb;border-radius:16px;padding:18px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Last month</div>
                <div style="margin-top:8px;font-size:28px;font-weight:800;color:#111827;">${escapeHtml(formatCurrency(report.previousMonth.total))}</div>
                <div style="margin-top:6px;font-size:13px;color:#6b7280;">${escapeHtml(report.previousMonth.label)}</div>
                  </div>
                </td>
                <td class="budget-kpi" style="padding-right:14px;">
                  <div style="border:1px solid #e5e7eb;border-radius:16px;padding:18px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">New month</div>
                <div style="margin-top:8px;font-size:28px;font-weight:800;color:#111827;">${escapeHtml(formatCurrency(report.currentMonth.total))}</div>
                <div style="margin-top:6px;font-size:13px;color:#6b7280;">${escapeHtml(report.currentMonth.label)}</div>
                  </div>
                </td>
                <td class="budget-kpi">
                  <div style="border:1px solid #e5e7eb;border-radius:16px;padding:18px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">MoM change</div>
                <div style="margin-top:8px;font-size:28px;font-weight:800;color:${
                  report.changeAmount > 0 ? "#b91c1c" : report.changeAmount < 0 ? "#047857" : "#111827"
                };">${escapeHtml(formatCurrency(report.changeAmount))}</div>
                <div style="margin-top:6px;font-size:13px;color:#6b7280;">${escapeHtml(changeLabel)}</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <div class="budget-section" style="padding:8px 32px 32px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">What was spent in ${escapeHtml(report.previousMonth.label)}</h2>
            ${previousMonthItems}

            <h2 style="margin:28px 0 12px;font-size:20px;color:#111827;">What is scheduled for ${escapeHtml(report.currentMonth.label)}</h2>
            ${currentMonthItems}

            <p class="budget-copy" style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
              Log in to SubTrack Pro to adjust budgets, update payment status, or review subscription changes before the month closes.
            </p>
          </div>
        </div>
        </div>
      </div>`,
    report,
  };
}

async function sendZohoBudgetEmail(
  primaryEmail: string,
  ccEmails: string[],
  subject: string,
  html: string,
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
        subject,
        content: html,
        mailFormat: "html",
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send Zoho budget email: ${body}`);
  }
}

export async function sendMonthlyBudgetReport(referenceDate = new Date()) {
  const [subscriptions, groups] = await Promise.all([
    getAllSubscriptions(),
    getBudgetRecipients(),
  ]);

  if (groups.length === 0) {
    const report = getBudgetReport(subscriptions, referenceDate);
    return {
      sent: 0,
      emailsSent: 0,
      previousMonthTotal: report.previousMonth.total,
      currentMonthTotal: report.currentMonth.total,
    };
  }

  const { subject, html, report } = buildBudgetEmail(subscriptions, referenceDate);

  for (const group of groups) {
    const orderedEmails = group.recipients
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((recipient) => recipient.email.trim())
      .filter(Boolean);
    const primaryEmail =
      group.recipients.find((recipient) => recipient.is_primary)?.email ||
      orderedEmails[0];
    const ccEmails = orderedEmails.filter((email) => email !== primaryEmail);

    await sendZohoBudgetEmail(primaryEmail, ccEmails, subject, html);
  }

  return {
    sent: report.currentMonth.items.length,
    emailsSent: groups.length,
    previousMonthTotal: report.previousMonth.total,
    currentMonthTotal: report.currentMonth.total,
  };
}
