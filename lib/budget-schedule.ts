const LAGOS_TIME_ZONE = "Africa/Lagos";

export function getLagosDateParts(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? "", 10);

  return { year: read("year"), month: read("month"), day: read("day") };
}

export function getLagosMonthKey(referenceDate = new Date()) {
  const { year, month } = getLagosDateParts(referenceDate);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isMonthlyBudgetSendDay(sendDay: number, referenceDate = new Date()) {
  return getLagosDateParts(referenceDate).day === sendDay;
}

export function isThreeDaysBeforeBudgetSend(
  sendDay: number,
  referenceDate = new Date(),
) {
  const { year, month, day } = getLagosDateParts(referenceDate);
  const today = Date.UTC(year, month - 1, day);
  let scheduled = Date.UTC(year, month - 1, sendDay);

  if (scheduled <= today) {
    scheduled = Date.UTC(year, month, sendDay);
  }

  return (scheduled - today) / (24 * 60 * 60 * 1000) === 3;
}
