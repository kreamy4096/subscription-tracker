import assert from "node:assert/strict";
import test from "node:test";
import {
  addBillingCycle,
  shouldAutomaticallySettle,
} from "../lib/subscription-dates.ts";

test("a subscription does not settle before 24 hours in Not Paid", () => {
  const changedAt = "2026-09-08T08:00:00.000Z";
  const now = new Date("2026-09-09T07:59:59.999Z");

  assert.equal(shouldAutomaticallySettle("Not Paid", changedAt, now), false);
});

test("a subscription settles after 24 hours in Not Paid", () => {
  const changedAt = "2026-09-08T08:00:00.000Z";
  const now = new Date("2026-09-09T08:00:00.000Z");

  assert.equal(shouldAutomaticallySettle("Not Paid", changedAt, now), true);
  assert.equal(shouldAutomaticallySettle("Pending", changedAt, now), false);
});

test("a monthly subscription advances when it settles", () => {
  assert.equal(addBillingCycle("2026-01-31", "monthly"), "2026-02-28");
});
