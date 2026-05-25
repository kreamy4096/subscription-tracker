import type { Subscription } from "@/lib/subscription-types";

export interface BudgetLineItem {
  id: string;
  tool: string;
  subscription: string;
  dueDate: string;
  amount: number;
  price: string;
  paymentStatus: string;
  billingType: Subscription["billing_type"];
}

export interface BudgetMonthSummary {
  key: string;
  label: string;
  total: number;
  items: BudgetLineItem[];
}

export interface BudgetReport {
  previousMonth: BudgetMonthSummary;
  currentMonth: BudgetMonthSummary;
  changeAmount: number;
  changePercent: number | null;
}

export interface MonthTrendPoint {
  key: string;
  label: string;
  total: number;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, count: number) {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function parseIsoDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePriceAmount(value: string | null | undefined) {
  const numeric = Number.parseFloat((value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getAnchorDate(subscription: Subscription) {
  return (
    parseIsoDate(subscription.next_due_date) || parseIsoDate(subscription.due_date)
  );
}

function buildOccurrenceDate(year: number, month: number, day: number) {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, maxDay));
}

function getOccurrenceForMonth(
  subscription: Subscription,
  targetMonth: Date,
) {
  if (subscription.action === "Canceled") {
    return null;
  }

  const anchor = getAnchorDate(subscription);
  if (!anchor) {
    return null;
  }

  const billingType = subscription.billing_type ?? "one_time";
  const year = targetMonth.getFullYear();
  const month = targetMonth.getMonth();
  const anchorDay = subscription.recurrence_day ?? anchor.getDate();

  if (billingType === "monthly") {
    return buildOccurrenceDate(year, month, anchorDay);
  }

  if (billingType === "yearly") {
    if (anchor.getMonth() !== month) {
      return null;
    }

    return buildOccurrenceDate(year, month, anchorDay);
  }

  if (anchor.getFullYear() === year && anchor.getMonth() === month) {
    return anchor;
  }

  return null;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatMonthLabel(value: Date, format: "short" | "long" = "long") {
  return value.toLocaleDateString("en-US", {
    month: format,
    year: "numeric",
  });
}

export function buildMonthSummary(
  subscriptions: Subscription[],
  targetDate: Date,
): BudgetMonthSummary {
  const month = startOfMonth(targetDate);
  const items = subscriptions
    .map((subscription) => {
      const occurrence = getOccurrenceForMonth(subscription, month);
      if (!occurrence) {
        return null;
      }

      return {
        id: subscription.id,
        tool: subscription.tool,
        subscription: subscription.subscription,
        dueDate: occurrence.toISOString().slice(0, 10),
        amount: parsePriceAmount(subscription.price),
        price: subscription.price,
        paymentStatus: subscription.payment_status,
        billingType: subscription.billing_type,
      } satisfies BudgetLineItem;
    })
    .filter((item): item is BudgetLineItem => Boolean(item))
    .sort((left, right) => {
      if (left.dueDate !== right.dueDate) {
        return left.dueDate.localeCompare(right.dueDate);
      }

      return left.tool.localeCompare(right.tool);
    });

  return {
    key: monthKey(month),
    label: formatMonthLabel(month),
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

export function getBudgetReport(
  subscriptions: Subscription[],
  referenceDate = new Date(),
): BudgetReport {
  const currentMonthDate = startOfMonth(referenceDate);
  const previousMonthDate = addMonths(currentMonthDate, -1);
  const previousMonth = buildMonthSummary(subscriptions, previousMonthDate);
  const currentMonth = buildMonthSummary(subscriptions, currentMonthDate);
  const changeAmount = currentMonth.total - previousMonth.total;
  const changePercent =
    previousMonth.total > 0
      ? (changeAmount / previousMonth.total) * 100
      : currentMonth.total > 0
        ? 100
        : null;

  return {
    previousMonth,
    currentMonth,
    changeAmount,
    changePercent,
  };
}

export function buildMonthTrend(
  subscriptions: Subscription[],
  referenceDate = new Date(),
  months = 6,
) {
  const currentMonthDate = startOfMonth(referenceDate);
  const startMonth = addMonths(currentMonthDate, -(months - 1));

  return Array.from({ length: months }, (_, index) =>
    buildMonthSummary(subscriptions, addMonths(startMonth, index)),
  ).map((summary) => ({
    key: summary.key,
    label: summary.label,
    total: summary.total,
  })) satisfies MonthTrendPoint[];
}
