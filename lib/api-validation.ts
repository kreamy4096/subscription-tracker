import "server-only";

export interface SubscriptionInput {
  tool: string;
  subscription: string;
  due_date: string;
  price: string;
  login_email: string;
  login_password: string;
  action: string;
  payment_status: string;
}

export interface ReminderSettingsInput {
  email: string;
  days_before: number;
  enabled: boolean;
}

const actions = new Set(["Renewal", "Upgrade", "Canceled", "FREE", ""]);
const paymentStatuses = new Set(["Paid", "Pending", "Not Paid", ""]);

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
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
    price: cleanString(input.price, 40),
    login_email: cleanString(input.login_email, 254),
    login_password: cleanString(input.login_password, 512),
    action: cleanString(input.action, 40),
    payment_status: cleanString(input.payment_status, 40),
  };

  if (!parsed.tool) {
    return { error: "Tool name is required" };
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
  const email = cleanString(input.email, 254);
  const daysBefore = Number.parseInt(String(input.days_before ?? ""), 10);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email must be a valid email address" };
  }

  if (!Number.isInteger(daysBefore) || daysBefore < 1 || daysBefore > 90) {
    return { error: "Days before must be between 1 and 90" };
  }

  return {
    data: {
      email,
      days_before: daysBefore,
      enabled: input.enabled === true,
    } satisfies ReminderSettingsInput,
  };
}
