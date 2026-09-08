export type BillingType = "one_time" | "monthly" | "yearly";

const AUTO_PAID_DELAY_MS = 24 * 60 * 60 * 1000;

const billingTypes = new Set<BillingType>(["one_time", "monthly", "yearly"]);

export function normalizeBillingType(value: unknown): BillingType {
  return typeof value === "string" && billingTypes.has(value as BillingType)
    ? (value as BillingType)
    : "one_time";
}

export function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getDateInputDay(value: string) {
  if (!isValidDateInput(value)) {
    return null;
  }

  return Number.parseInt(value.slice(8, 10), 10);
}

export function addBillingCycle(value: string, billingType: BillingType) {
  if (!isValidDateInput(value) || billingType === "one_time") {
    return value;
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const monthIndex = month - 1;
  const targetMonthIndex = billingType === "monthly" ? monthIndex + 1 : monthIndex;
  const targetYear = billingType === "yearly" ? year + 1 : year;
  const targetMonth = new Date(Date.UTC(targetYear, targetMonthIndex, 1));
  const maxDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const next = new Date(
    Date.UTC(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth(),
      Math.min(day, maxDay),
    ),
  );

  return next.toISOString().slice(0, 10);
}

export function getReminderStartDate(nextDueDate: string, daysBefore: number) {
  if (!isValidDateInput(nextDueDate)) {
    return "";
  }

  const date = new Date(`${nextDueDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function diffInDaysFromToday(value: string, now = new Date()) {
  if (!isValidDateInput(value)) {
    return null;
  }

  const targetDate = new Date(`${value}T00:00:00Z`);
  const today = startOfUtcDay(now);
  return Math.floor(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function getAutomaticPaymentStatus(
  nextDueDate: string,
  currentStatus: string,
  now = new Date(),
) {
  const daysUntilDue = diffInDaysFromToday(nextDueDate, now);
  if (daysUntilDue === null) {
    return currentStatus || "Not Paid";
  }

  if (daysUntilDue <= 0) {
    return "Not Paid";
  }

  if (daysUntilDue <= 7) {
    return "Pending";
  }

  return "Paid";
}

export function shouldAutomaticallySettle(
  currentStatus: string,
  statusChangedAt: string | Date | null | undefined,
  now = new Date(),
) {
  if (currentStatus !== "Not Paid" || !statusChangedAt) {
    return false;
  }

  const changedAt =
    statusChangedAt instanceof Date
      ? statusChangedAt.getTime()
      : new Date(statusChangedAt).getTime();

  return (
    Number.isFinite(changedAt) &&
    now.getTime() - changedAt >= AUTO_PAID_DELAY_MS
  );
}
