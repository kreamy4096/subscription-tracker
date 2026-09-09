import "server-only";

import { isValidDateInput } from "@/lib/subscription-dates";
import {
  subscriptionPlanOptions,
  type PaygTopUp,
  type PostpaidBill,
} from "@/lib/subscription-types";

export interface SubscriptionInput {
  tool: string;
  subscription: string;
  due_date: string;
  billing_type: "one_time" | "monthly" | "yearly";
  recurrence_day: number | null;
  next_due_date: string;
  price: string;
  estimated_monthly_budget: string;
  last_top_up_date: string;
  current_balance: string;
  payg_top_ups: PaygTopUp[];
  estimated_monthly_bill: string;
  statement_generation_date: string;
  bill_status: "Pending Invoice" | "Settled";
  bill_status_month: string;
  postpaid_bills: PostpaidBill[];
  login_email: string;
  login_password: string;
  action: string;
  payment_status: string;
}

export interface ReminderSettingsInput {
  groups: ReminderGroupInput[];
}

export interface BudgetMailSettingsInput {
  enabled: boolean;
  send_day: number;
  recipients: ReminderRecipientInput[];
}

export interface ReminderGroupInput {
  id?: string;
  name: string;
  days_before: number;
  enabled: boolean;
  recipients: ReminderRecipientInput[];
  subscription_ids: string[];
}

export interface ReminderRecipientInput {
  id?: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
}

const actions = new Set([
  "Renewal",
  "PAYG Renewal",
  "Upgrade",
  "Canceled",
  "FREE",
  "",
]);
const paymentStatuses = new Set(["Paid", "Pending", "Not Paid", ""]);
const billingTypes = new Set(["one_time", "monthly", "yearly"]);
const subscriptionPlans = new Set<string>(subscriptionPlanOptions);

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseSubscriptionInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "Invalid request body" };
  }

  const input = value as Record<string, unknown>;
  const parsed: SubscriptionInput = {
    tool: cleanString(input.tool, 120),
    subscription: cleanString(input.subscription, 120),
    due_date: cleanString(input.due_date, 80),
    billing_type: billingTypes.has(String(input.billing_type))
      ? (String(input.billing_type) as SubscriptionInput["billing_type"])
      : "one_time",
    recurrence_day: null,
    next_due_date: cleanString(input.next_due_date, 10),
    price: cleanString(input.price, 40),
    estimated_monthly_budget: cleanString(input.estimated_monthly_budget, 40),
    last_top_up_date: cleanString(input.last_top_up_date, 10),
    current_balance: cleanString(input.current_balance, 40),
    payg_top_ups: Array.isArray(input.payg_top_ups)
      ? input.payg_top_ups.map((value, index) => {
          const topUp = value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};
          return {
            id: cleanString(topUp.id, 80) || `topup-${index}`,
            date: cleanString(topUp.date, 10),
            amount: cleanString(topUp.amount, 40),
          };
        })
      : [],
    estimated_monthly_bill: cleanString(input.estimated_monthly_bill, 40),
    statement_generation_date: cleanString(input.statement_generation_date, 10),
    bill_status: input.bill_status === "Settled" ? "Settled" : "Pending Invoice",
    bill_status_month: cleanString(input.bill_status_month, 7),
    postpaid_bills: Array.isArray(input.postpaid_bills)
      ? input.postpaid_bills.map((value, index) => {
          const bill = value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};
          return {
            id: cleanString(bill.id, 80) || `bill-${index}`,
            month: cleanString(bill.month, 7),
            amount: cleanString(bill.amount, 40),
          };
        })
      : [],
    login_email: cleanString(input.login_email, 254),
    login_password: cleanString(input.login_password, 512),
    action: cleanString(input.action, 40),
    payment_status: cleanString(input.payment_status, 40),
  };

  if (!parsed.tool) {
    return { error: "Tool name is required" };
  }

  if (!subscriptionPlans.has(parsed.subscription)) {
    return { error: "Plan / Subscription is invalid" };
  }

  if (parsed.subscription === "Free") {
    parsed.due_date = "";
    parsed.billing_type = "one_time";
    parsed.recurrence_day = null;
    parsed.next_due_date = "";
    parsed.price = "$0";
    parsed.action = "FREE";
    parsed.payment_status = "";
    parsed.estimated_monthly_budget = "";
    parsed.last_top_up_date = "";
    parsed.current_balance = "";
    parsed.payg_top_ups = [];
    parsed.estimated_monthly_bill = "";
    parsed.statement_generation_date = "";
    parsed.bill_status = "Pending Invoice";
    parsed.bill_status_month = "";
    parsed.postpaid_bills = [];
  }

  if (parsed.subscription === "PAYG (Postpaid)") {
    parsed.estimated_monthly_bill = parsed.estimated_monthly_bill || parsed.price;
    parsed.price = parsed.estimated_monthly_bill;
    parsed.statement_generation_date =
      parsed.statement_generation_date || parsed.due_date;
    parsed.due_date = parsed.statement_generation_date;
    parsed.next_due_date = parsed.statement_generation_date;
    parsed.billing_type = "monthly";
    parsed.recurrence_day = parsed.statement_generation_date
      ? Number.parseInt(parsed.statement_generation_date.slice(8, 10), 10)
      : null;
    parsed.action = "Renewal";
    parsed.payment_status = "Paid";
    parsed.bill_status_month = parsed.bill_status_month || new Date().toISOString().slice(0, 7);

    const estimate = Number.parseFloat(
      parsed.estimated_monthly_bill.replace(/[^0-9.]/g, ""),
    );
    if (!Number.isFinite(estimate) || estimate <= 0) {
      return { error: "Estimated monthly bill must be greater than zero" };
    }
    if (!isValidDateInput(parsed.statement_generation_date)) {
      return { error: "Statement generation date is required" };
    }
    const billMonths = new Set<string>();
    for (const bill of parsed.postpaid_bills) {
      if (!/^\d{4}-\d{2}$/.test(bill.month)) {
        return { error: "Each postpaid bill needs a valid billing month" };
      }
      if (billMonths.has(bill.month)) {
        return { error: "Only one postpaid bill can be logged per month" };
      }
      billMonths.add(bill.month);
      const amount = Number.parseFloat(bill.amount.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        return { error: "Each postpaid bill amount must be greater than zero" };
      }
    }
  }

  if (parsed.subscription === "PAYG") {
    parsed.estimated_monthly_budget = parsed.estimated_monthly_budget || parsed.price;
    parsed.price = parsed.estimated_monthly_budget;
    parsed.last_top_up_date = parsed.last_top_up_date || parsed.due_date;
    parsed.due_date = parsed.last_top_up_date;
    parsed.next_due_date = "";
    parsed.billing_type = "monthly";
    parsed.recurrence_day = null;
    parsed.action = parsed.action || "PAYG Renewal";

    if (!parsed.estimated_monthly_budget) {
      return { error: "Estimated monthly budget is required for PAYG plans" };
    }
    const estimatedBudget = Number.parseFloat(
      parsed.estimated_monthly_budget.replace(/[^0-9.]/g, ""),
    );
    if (!Number.isFinite(estimatedBudget) || estimatedBudget <= 0) {
      return { error: "Estimated monthly budget must be greater than zero" };
    }
    if (parsed.current_balance) {
      const currentBalance = Number.parseFloat(
        parsed.current_balance.replace(/[^0-9.]/g, ""),
      );
      if (!Number.isFinite(currentBalance) || currentBalance < 0) {
        return { error: "Current balance must be zero or greater" };
      }
    }
    if (parsed.last_top_up_date && !isValidDateInput(parsed.last_top_up_date)) {
      return { error: "Last top-up date must be a valid calendar date" };
    }
    for (const topUp of parsed.payg_top_ups) {
      if (!isValidDateInput(topUp.date)) {
        return { error: "Each top-up entry needs a valid date" };
      }
      const amount = Number.parseFloat(topUp.amount.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        return { error: "Each top-up amount must be greater than zero" };
      }
    }
    const latestLoggedTopUp = [...parsed.payg_top_ups]
      .sort((left, right) => right.date.localeCompare(left.date))[0];
    if (latestLoggedTopUp) {
      parsed.last_top_up_date = latestLoggedTopUp.date;
      parsed.due_date = latestLoggedTopUp.date;
    }
  }

  if (!parsed.next_due_date && parsed.subscription !== "PAYG") {
    parsed.next_due_date = parsed.due_date;
  }

  if (parsed.next_due_date && !isValidDateInput(parsed.next_due_date)) {
    return { error: "Next due date must be a valid calendar date" };
  }

  if (parsed.billing_type !== "one_time" && parsed.subscription !== "PAYG") {
    if (!parsed.next_due_date) {
      return { error: "Recurring subscriptions need a next due date" };
    }

    parsed.recurrence_day = Number.parseInt(parsed.next_due_date.slice(8, 10), 10);
  }

  if (parsed.login_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.login_email)) {
    return { error: "Login email must be a valid email address" };
  }

  if (!actions.has(parsed.action)) {
    return { error: "Action is invalid" };
  }

  if (parsed.subscription !== "Free" && parsed.action === "FREE") {
    return { error: "Only Free plans can use the FREE action" };
  }

  if (!paymentStatuses.has(parsed.payment_status)) {
    return { error: "Payment status is invalid" };
  }

  return { data: parsed };
}

export function parseBudgetMailSettingsInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "Invalid request body" };
  }

  const input = value as Record<string, unknown>;
  const rawRecipients = Array.isArray(input.recipients) ? input.recipients : [];
  const recipients = rawRecipients
    .map((recipientValue, index) => {
      const recipient =
        recipientValue && typeof recipientValue === "object"
          ? (recipientValue as Record<string, unknown>)
          : {};

      return {
        id: cleanString(recipient.id, 80) || undefined,
        email: cleanString(recipient.email, 254).toLowerCase(),
        is_primary: recipient.is_primary === true,
        is_active: recipient.is_active !== false,
        sort_order: Number.isInteger(Number(recipient.sort_order))
          ? Number(recipient.sort_order)
          : index,
      };
    })
    .filter((recipient) => recipient.email)
    .sort((left, right) => left.sort_order - right.sort_order);

  const emailKeys = new Set<string>();
  for (const recipient of recipients) {
    if (!isValidEmail(recipient.email)) {
      return { error: "Each budget report email must be a valid email address" };
    }

    if (emailKeys.has(recipient.email)) {
      return { error: "Budget report emails must be unique" };
    }

    emailKeys.add(recipient.email);
  }

  const enabled = input.enabled === true;
  const sendDay = Number.parseInt(String(input.send_day ?? "1"), 10);
  if (!Number.isInteger(sendDay) || sendDay < 1 || sendDay > 28) {
    return { error: "Monthly budget email day must be between 1 and 28" };
  }
  const activeRecipients = recipients.filter((recipient) => recipient.is_active);
  if (enabled && activeRecipients.length === 0) {
    return { error: "Enabled budget reports need at least one active email" };
  }

  const firstPrimaryIndex = recipients.findIndex(
    (recipient) => recipient.is_primary && recipient.is_active,
  );
  const firstActiveIndex = recipients.findIndex((recipient) => recipient.is_active);
  const normalizedRecipients = recipients.map((recipient, index) => ({
    ...recipient,
    sort_order: index,
    is_primary:
      recipient.is_active &&
      activeRecipients.length > 0 &&
      (firstPrimaryIndex === -1
        ? index === firstActiveIndex
        : index === firstPrimaryIndex),
  }));

  return {
    data: {
      enabled,
      send_day: sendDay,
      recipients: normalizedRecipients,
    } satisfies BudgetMailSettingsInput,
  };
}

export function parseReminderSettingsInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return { error: "Invalid request body" };
  }

  const input = value as Record<string, unknown>;
  const rawGroups = Array.isArray(input.groups)
    ? input.groups
    : [
        {
          id: undefined,
          name: "Default",
          days_before: input.days_before,
          enabled: input.enabled,
          recipients: Array.isArray(input.recipients)
            ? input.recipients
            : cleanString(input.email, 1000)
                .split(",")
                .map((email) => ({ email, is_primary: false, is_active: true })),
        },
      ];

  const groups = rawGroups.map((item, groupIndex) => {
    const group =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const daysBefore = Number.parseInt(String(group.days_before ?? ""), 10);
    const rawRecipients = Array.isArray(group.recipients)
      ? group.recipients
      : [];

    const recipients = rawRecipients
      .map((recipientValue, index) => {
        const recipient =
          recipientValue && typeof recipientValue === "object"
            ? (recipientValue as Record<string, unknown>)
            : {};
        return {
          id: cleanString(recipient.id, 80) || undefined,
          email: cleanString(recipient.email, 254).toLowerCase(),
          is_primary: recipient.is_primary === true,
          is_active: recipient.is_active !== false,
          sort_order: Number.isInteger(Number(recipient.sort_order))
            ? Number(recipient.sort_order)
            : index,
        };
      })
      .filter((recipient) => recipient.email)
      .sort((a, b) => a.sort_order - b.sort_order);

    return {
      id: cleanString(group.id, 80) || undefined,
      name: cleanString(group.name, 80) || `Group ${groupIndex + 1}`,
      days_before: daysBefore,
      enabled: group.enabled === true,
      recipients,
      subscription_ids: Array.isArray(group.subscription_ids)
        ? group.subscription_ids
            .map((item) => cleanString(item, 80))
            .filter(Boolean)
        : [],
    };
  });

  if (groups.length === 0) {
    return { error: "Add at least one reminder group" };
  }

  for (const group of groups) {
    if (
      !Number.isInteger(group.days_before) ||
      group.days_before < 1 ||
      group.days_before > 90
    ) {
      return { error: "Days before must be between 1 and 90" };
    }

    const emailKeys = new Set<string>();
    for (const recipient of group.recipients) {
      if (!isValidEmail(recipient.email)) {
        return { error: "Each reminder email must be a valid email address" };
      }

      if (emailKeys.has(recipient.email)) {
        return { error: "Reminder emails must be unique within each group" };
      }

      emailKeys.add(recipient.email);
    }

    const activeRecipients = group.recipients.filter(
      (recipient) => recipient.is_active,
    );
    if (group.enabled && activeRecipients.length === 0) {
      return {
        error: "Enabled reminder groups need at least one active email",
      };
    }

    const firstPrimaryIndex = group.recipients.findIndex(
      (recipient) => recipient.is_primary && recipient.is_active,
    );
    group.recipients = group.recipients.map((recipient, index) => ({
      ...recipient,
      sort_order: index,
      is_primary:
        recipient.is_active &&
        activeRecipients.length > 0 &&
        (firstPrimaryIndex === -1
          ? index === group.recipients.findIndex((item) => item.is_active)
          : index === firstPrimaryIndex),
    }));
  }

  return {
    data: {
      groups,
    } satisfies ReminderSettingsInput,
  };
}
