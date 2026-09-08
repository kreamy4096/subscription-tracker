import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthSummary } from "../lib/budget.ts";
import type { Subscription } from "../lib/subscription-types.ts";

function makePayg(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "payg-1",
    tool: "Usage API",
    subscription: "PAYG",
    due_date: "2026-09-12",
    billing_type: "monthly",
    price: "$200",
    estimated_monthly_budget: "$200",
    last_top_up_date: "2026-09-12",
    current_balance: "$48",
    payg_top_ups: [],
    login_email: "",
    action: "PAYG Renewal",
    payment_status: "Pending",
    ...overrides,
  };
}

test("PAYG uses the estimate when the month has no logged top-ups", () => {
  const report = buildMonthSummary([makePayg()], new Date(2026, 8, 1));

  assert.equal(report.total, 200);
  assert.equal(report.items[0]?.amountSource, "payg_estimate");
});

test("PAYG sums all actual top-ups logged in the report month", () => {
  const subscription = makePayg({
    payg_top_ups: [
      { id: "1", date: "2026-09-02", amount: "$50" },
      { id: "2", date: "2026-09-18", amount: "$75.50" },
      { id: "3", date: "2026-08-30", amount: "$900" },
    ],
  });
  const report = buildMonthSummary([subscription], new Date(2026, 8, 1));

  assert.equal(report.total, 125.5);
  assert.equal(report.items[0]?.amountSource, "payg_actual");
  assert.equal(report.items[0]?.dueDate, "2026-09-18");
});

test("canceled PAYG subscriptions are omitted", () => {
  const report = buildMonthSummary(
    [makePayg({ action: "Canceled" })],
    new Date(2026, 8, 1),
  );

  assert.equal(report.total, 0);
  assert.equal(report.items.length, 0);
});

test("PAYG normalizes database Date values before sorting budget items", () => {
  const report = buildMonthSummary(
    [
      makePayg({
        last_top_up_date: new Date("2026-09-12T00:00:00.000Z") as unknown as string,
      }),
    ],
    new Date(2026, 8, 1),
  );

  assert.equal(report.items[0]?.dueDate, "2026-09-12");
});
