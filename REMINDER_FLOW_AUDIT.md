# Reminder Flow Audit

## Purpose

This document explains, in plain terms, why reminder emails may never send in the current system. It follows the flow from adding a subscription, to tracking its due date, to deciding whether it should be included in a reminder email.

## Plain-English Flow Today

1. A user adds or edits a subscription from the Add Subscription modal.
2. The modal sends the subscription details to `/api/subscriptions`.
3. The subscription is saved in the `subscriptions` database table.
4. Reminder settings are saved separately in reminder groups and reminder recipients.
5. The reminder engine runs only when something calls `sendDueReminders()`.
6. The engine loads enabled reminder groups.
7. The engine loads active reminder recipient emails for each group.
8. The engine loads subscriptions whose payment status is not `Paid`.
9. For each unpaid subscription, the engine tries to work out how many days remain until the due date.
10. If the subscription is due within the group's configured `days_before` value, the engine sends an email through Zoho.

## Desired Reminder Behavior

This is the target behavior for each subscription:

1. The user sets a reminder window, for example `3 days before`.
2. The system starts sending reminders 3 days before the subscription due date.
3. If the subscription reaches `Not Paid`, the system records when that status began.
4. After 24 hours in `Not Paid`, the system automatically marks it `Paid`.
5. Recurring subscriptions advance to their next billing cycle at the same time.

In simple terms: the reminder gets a one-day collection window, then the subscription is treated as automatically paid without waiting for a manual update.

## Major Findings

### 1. The Automatic Scheduler May Never Run In Production

The app currently uses `node-cron` inside the Next.js server process.

That only works if the deployed app is running as a long-lived Node server that stays awake all day. If the app is deployed on a serverless platform like Vercel, the process does not stay alive in the same way, so the in-app cron job cannot be trusted to fire every morning.

In simple terms: the reminder engine exists, but production may never wake it up.

### 2. The Manual Send Route Uses POST Only

The manual reminder endpoint is:

```text
POST /api/reminders/send
```

That works for a manual test or an external cron service that can send POST requests.

However, if this is meant to use Vercel Cron, Vercel calls cron endpoints with GET requests. The current route rejects GET requests with `405 Method Not Allowed`.

In simple terms: even if a Vercel cron job is added, it would call the wrong method for the current route and reminders still would not send.

### 3. New Subscriptions Are Saved As Paid By Default

The Add Subscription modal defaults the payment status to `Paid`.

The reminder engine ignores every subscription marked `Paid`.

That means a newly added subscription will not be eligible for reminders unless the user manually changes the status to `Pending` or `Not Paid`.

In simple terms: the system is creating subscriptions in a state that tells the reminder engine, "do not remind me about this."

### 4. Reminder Recipients Can Be Missing

The reminder engine skips a reminder group if it has no active recipient email.

The database can create a default reminder group, but that does not always guarantee a matching recipient row exists. The legacy fallback email can exist in `reminder_settings`, while the newer reminder recipient table can still be empty.

In simple terms: the settings can look partly initialized, but the sender may still have nobody to email.

### 5. The Recurring Due Date Field Is Free Text

The Add Subscription modal has two date-related fields:

- `Due Date`: a proper calendar date input.
- `Recurring Due Date`: a free text field, for example `23rd of every month`.

The reminder engine tries to parse the recurring text by looking for a day number inside the text. For example, it can detect `23` from `23rd of every month`.

This is fragile because users can type many things the engine cannot reliably understand:

- `monthly`
- `end of month`
- `every Friday`
- `15/06`
- `next renewal`
- `first business day`
- `23rd monthly`

Some of those may fail completely. Others may be misunderstood. A reminder system should not depend on guessing what a free text field means.

In simple terms: the app is asking users for a schedule in human language, then hoping the code guesses correctly later.

### 6. Recurring Monthly Date Calculation Has A Bug

For recurring monthly dates, if the due day has already passed this month, the engine should calculate the next occurrence in the next month.

Right now, it calculates the current month date and returns it even when that date is already in the past.

For overdue subscriptions, a negative value is useful because the desired behavior is to keep reminding daily after the due date. The bug is not that overdue subscriptions are included. The bug is that the system does not clearly separate these two cases:

- A subscription that is overdue and should keep reminding until marked paid.
- A recurring monthly subscription whose next cycle should roll forward after the current cycle is handled.

In simple terms: continuing reminders after the due date is correct. Failing to roll the subscription forward to the next billing cycle after it is paid is the part that needs clearer logic.

## Recommended Target Design

### Subscription Dates

Replace the free text recurring field with structured fields.

Recommended minimum fields:

- `billing_type`: `one_time`, `monthly`, or `yearly`
- `due_date`: date for one-time subscriptions
- `recurrence_unit`: `month`, `year`, or other supported interval
- `recurrence_day`: day of month for monthly billing
- `next_due_date`: the next exact date the engine should check

The engine should use `next_due_date` for reminder checks. After a subscription is paid or renewed, the system should calculate and save the next `next_due_date`.

### Reminder Trigger

Use one reliable scheduler strategy:

- For Vercel: add a Vercel cron config and support GET on the reminder route.
- For another host: keep `node-cron`, but deploy only to a long-running Node server.
- For a third-party cron service: keep the POST route and configure the service to call it with the cron secret.

### Reminder Eligibility

Decide what the payment status means.

If reminders should be sent before payment is due, then new subscriptions probably should not default to `Paid`. A better default may be `Pending`, or the engine should remind based on active subscriptions regardless of current payment status.

### Recipient Setup

Make the reminder settings setup atomic:

- A default reminder group should not be considered usable until it has at least one active recipient.
- The UI should clearly show when reminders are enabled but no active recipient exists.
- The sender should return a clear reason when it skips sending.

## Implementation Checklist

### Scheduling

- [x] Decide the production scheduler: Vercel Cron, third-party cron, or long-running Node server.
- [x] If using Vercel Cron, add `vercel.json` with the reminder path and schedule.
- [x] If using Vercel Cron, add `GET /api/reminders/send` support.
- [x] Keep `POST /api/reminders/send` for manual tests and external cron services.
- [x] Confirm the cron secret check works for the chosen scheduler.
- [x] Add logs that clearly say when the reminder job starts, skips, sends, or fails.

### Subscription Date Model

- [x] Replace the free text recurring date field with structured recurrence controls.
- [x] Add or migrate database columns for recurrence type and next due date.
- [x] Store an exact `next_due_date` for every subscription that should be tracked.
- [x] Validate that a reminder-trackable subscription cannot be saved without a usable next due date.
- [x] Add a helper that calculates the next due date after each renewal/payment.
- [ ] Add tests for monthly dates, end-of-month dates, yearly dates, and invalid dates.

### Add Subscription Modal

- [x] Change the default payment status from `Paid`, or confirm that reminders should only apply to manually marked unpaid subscriptions.
- [x] Replace `Recurring Due Date` free text with date/schedule controls.
- [x] Show a preview like `Next reminder: May 20, 2026` based on the selected settings.
- [x] Prevent saving ambiguous recurrence values.
- [ ] Make it clear whether the subscription is active, canceled, free, or reminder-eligible.

### Reminder Engine

- [x] Use `next_due_date` instead of parsing free text.
- [x] Fix recurring monthly rollover so passed dates move to the next month.
- [x] Decide whether overdue subscriptions should be included, and document that behavior.
- [x] Keep sending daily reminders after the due date while payment status is not `Paid`.
- [x] Stop reminders immediately after payment status changes to `Paid`.
- [x] When a recurring subscription is marked `Paid`, calculate and save the next cycle's due date.
- [x] Return skip reasons from `sendDueReminders()`, not only `{ sent: 0 }`.
- [x] Make the engine report counts for skipped groups, missing recipients, paid subscriptions, invalid dates, and due subscriptions.

### Reminder Recipients

- [ ] Ensure every enabled group has at least one active recipient.
- [ ] Backfill recipient rows from legacy `reminder_settings.email` where needed.
- [ ] Show a clear UI warning when reminders are enabled but no active recipient exists.
- [ ] Test delivery to one primary recipient.
- [ ] Test delivery to primary plus CC recipients.

### Testing And Verification

- [ ] Add a safe dry-run mode for `/api/reminders/send`.
- [ ] Add a manual test route or script that explains exactly why a reminder would or would not send.
- [ ] Test a subscription due today.
- [ ] Test a subscription due within the reminder window.
- [ ] Test a subscription due outside the reminder window.
- [ ] Test a subscription marked `Paid`.
- [ ] Test a subscription marked `Pending`.
- [ ] Test a subscription marked `Not Paid`.
- [ ] Test missing Zoho environment variables.
- [ ] Test invalid or expired Zoho refresh token behavior.
- [ ] Run production build after changes.

## Highest-Priority Fix Order

1. Pick and implement a reliable production scheduler.
2. Fix the reminder route method for the chosen scheduler.
3. Stop relying on free text for recurring dates.
4. Store and use exact next due dates.
5. Revisit the default `Paid` status.
6. Add skip-reason logging so `{ sent: 0 }` is explainable.
