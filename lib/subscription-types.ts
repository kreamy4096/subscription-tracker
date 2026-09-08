export interface PaygTopUp {
  id: string;
  date: string;
  amount: string;
}

export interface Subscription {
  id: string;
  tool: string;
  subscription: string;
  due_date: string;
  billing_type?: "one_time" | "monthly" | "yearly";
  recurrence_day?: number | null;
  next_due_date?: string;
  price: string;
  estimated_monthly_budget?: string;
  last_top_up_date?: string;
  current_balance?: string;
  payg_top_ups?: PaygTopUp[];
  login_email: string;
  login_password?: string;
  has_login_password?: boolean;
  action: string;
  payment_status: string;
  created_at?: string;
}

export interface ReminderSettings {
  email: string;
  days_before: number;
  enabled: boolean;
  groups?: ReminderGroup[];
  recipients?: ReminderRecipient[];
}

export interface ReminderGroup {
  id: string;
  name: string;
  days_before: number;
  enabled: boolean;
  recipients: ReminderRecipient[];
  subscription_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export const subscriptionPlanOptions = [
  "Free",
  "Paid",
  "PAYG",
  "Pro(The Zone)",
] as const;

export type SubscriptionPlan = (typeof subscriptionPlanOptions)[number];

export function normalizeSubscriptionPlan(value: unknown, action?: unknown) {
  if (
    typeof value === "string" &&
    subscriptionPlanOptions.includes(value as SubscriptionPlan)
  ) {
    return value as SubscriptionPlan;
  }

  if (action === "FREE") {
    return "Free";
  }

  if (action === "PAYG Renewal") {
    return "PAYG";
  }

  return "Paid";
}

export interface ReminderRecipient {
  id: string;
  group_id?: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetMailSettings {
  id?: string;
  enabled: boolean;
  recipients: ReminderRecipient[];
  updated_at?: string;
}
