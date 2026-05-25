import "server-only";

import { isValidDateInput } from "@/lib/subscription-dates";

export interface SubscriptionInput {
  tool: string;
  subscription: string;
  due_date: string;
  billing_type: "one_time" | "monthly" | "yearly";
  recurrence_day: number | null;
  next_due_date: string;
  price: string;
  login_email: string;
  login_password: string;
  action: string;
  payment_status: string;
}

export interface ReminderSettingsInput {
  groups: ReminderGroupInput[];
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
    login_email: cleanString(input.login_email, 254),
    login_password: cleanString(input.login_password, 512),
    action: cleanString(input.action, 40),
    payment_status: cleanString(input.payment_status, 40),
  };

  if (!parsed.tool) {
    return { error: "Tool name is required" };
  }

  if (!parsed.next_due_date) {
    parsed.next_due_date = parsed.due_date;
  }

  if (parsed.next_due_date && !isValidDateInput(parsed.next_due_date)) {
    return { error: "Next due date must be a valid calendar date" };
  }

  if (parsed.billing_type !== "one_time") {
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

  if (!paymentStatuses.has(parsed.payment_status)) {
    return { error: "Payment status is invalid" };
  }

  return { data: parsed };
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
