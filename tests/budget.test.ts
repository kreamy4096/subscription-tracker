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

test("postpaid uses the current cycle's exact invoice when available", () => {
  const subscription = makePayg({
    subscription: "PAYG (Postpaid)",
    estimated_monthly_bill: "$300",
    statement_generation_date: "2026-09-10",
    bill_status: "Settled",
    postpaid_bills: [
      { id: "current", month: "2026-09", amount: "$246.75" },
      { id: "previous", month: "2026-08", amount: "$210" },
    ],
  });
  const report = buildMonthSummary([subscription], new Date(2026, 8, 1));

  assert.equal(report.total, 246.75);
  assert.equal(report.items[0]?.amountSource, "postpaid_actual");
});

test("postpaid forecasts from the latest three historical bills", () => {
  const subscription = makePayg({
    subscription: "PAYG (Postpaid)",
    estimated_monthly_bill: "$500",
    statement_generation_date: "2026-09-10",
    bill_status: "Pending Invoice",
    postpaid_bills: [
      { id: "1", month: "2026-08", amount: "$180" },
      { id: "2", month: "2026-07", amount: "$240" },
      { id: "3", month: "2026-06", amount: "$300" },
      { id: "4", month: "2026-05", amount: "$900" },
    ],
  });
  const report = buildMonthSummary([subscription], new Date(2026, 8, 1));

  assert.equal(report.total, 240);
  assert.equal(report.items[0]?.amountSource, "postpaid_average");
});

test("postpaid falls back to its estimate without bill history", () => {
  const subscription = makePayg({
    subscription: "PAYG (Postpaid)",
    estimated_monthly_bill: "$325",
    statement_generation_date: "2026-09-10",
    postpaid_bills: [],
  });
  const report = buildMonthSummary([subscription], new Date(2026, 8, 1));

  assert.equal(report.total, 325);
  assert.equal(report.items[0]?.amountSource, "postpaid_estimate");
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
