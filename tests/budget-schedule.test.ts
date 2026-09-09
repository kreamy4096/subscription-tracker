import assert from "node:assert/strict";
import test from "node:test";
import {
  isMonthlyBudgetSendDay,
  isThreeDaysBeforeBudgetSend,
} from "../lib/budget-schedule.ts";

test("recognizes the configured monthly budget send day in Lagos", () => {
  assert.equal(
    isMonthlyBudgetSendDay(5, new Date("2026-09-05T07:00:00.000Z")),
    true,
  );
});

test("recognizes the three-day warning date in the same month", () => {
  assert.equal(
    isThreeDaysBeforeBudgetSend(12, new Date("2026-09-09T07:00:00.000Z")),
    true,
  );
});

test("recognizes a three-day warning across a month boundary", () => {
  assert.equal(
    isThreeDaysBeforeBudgetSend(1, new Date("2026-09-28T07:00:00.000Z")),
    true,
  );
});
