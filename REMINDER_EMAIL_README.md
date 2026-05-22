# Reminder Email Management Plan

## Goal

Replace the current comma-separated reminder recipient field with a clean email-management modal that supports a primary recipient and CC recipients, then update Zoho reminder delivery and email template rendering.
The reminder system now also supports multiple recipient groups, manual recipient order, inactive recipients, and hard deletion.

## Current Findings

- The settings gear in the dashboard currently opens `ReminderDrawer`.
- Reminder settings are stored in the `reminder_settings` table as:
  - `email TEXT NOT NULL`
  - `days_before INTEGER`
  - `enabled BOOLEAN`
- The UI currently edits all reminder emails in one comma-separated text field.
- `sendZohoReminderEmail` currently sends every configured reminder email through Zoho `toAddress`.
- Zoho Mail API supports both `toAddress` and `ccAddress` in the send-mail request body.
- Current reminder email HTML is built in `buildReminderEmail` inside `lib/reminders.ts`.

## Target Behavior

- Clicking the top settings gear opens a modal, not the current side drawer.
- The modal shows the existing reminder email list.
- Users can add a new email from a compact input below the list.
- Users can hard delete an email from the list.
- Users can mark an email inactive without deleting it.
- Users can drag recipients to set the group order and CC order.
- Users can mark exactly one email as primary.
- Users can manage multiple reminder groups with separate enabled status and days-before settings.
- Reminder delivery sends:
  - Primary email in `toAddress`
  - All other active emails in `ccAddress`
- If no explicit primary exists, the first email in the list becomes the primary recipient.
- The email template will be redesigned after the user provides a screenshot/reference design.

## UI Direction

- Use a centered modal consistent with the existing Add Subscription modal.
- Keep the modal compact and operational, not marketing-like.
- Suggested structure:
  - Header: `Reminder Settings`
  - Reminder timing row: enabled toggle and days-before input
  - Email list: each row shows email, primary toggle, remove icon
  - Add email row: small input plus checkbox/toggle to add as primary
  - Footer: cancel/save actions
- Prefer icon buttons for remove/close actions.
- Use toggles/checkboxes for enabled and primary states.
- Keep row spacing dense but readable.

## Data Model Plan

- Preserve backward compatibility with existing `reminder_settings.email`.
- Use new `reminder_groups` and `reminder_recipients` tables.
- Runnable SQL is available in `sql/reminder_recipients.sql`.

### Preferred Schema

```sql
CREATE TABLE IF NOT EXISTS reminder_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default',
  days_before INTEGER DEFAULT 3,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

```sql
CREATE TABLE IF NOT EXISTS reminder_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES reminder_groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Recommended indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_group_email_key
ON reminder_recipients (group_id, email_normalized);
```

```sql
CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_one_primary_per_group
ON reminder_recipients (group_id)
WHERE is_primary = true;
```

## API Plan

- Update `GET /api/reminder-settings` to return:
  - `enabled`
  - `days_before`
  - `recipients: Array<{ id, email, is_primary }>`
- Update `POST /api/reminder-settings` to accept the same shape.
- Validate:
  - At least one valid email when reminders are enabled.
  - No duplicate emails.
  - Exactly one primary if recipients exist, or automatically promote the first recipient.
  - `days_before` remains between 1 and 90.
- Migrate old comma-separated emails from `reminder_settings.email` into the new recipient structure.

## Zoho Delivery Plan

- Update reminder delivery to split recipients into:
  - `toAddress`: primary recipient
  - `ccAddress`: comma-separated non-primary recipients
- Keep `fromAddress`, `subject`, `content`, and `mailFormat: "html"`.
- Do not include `ccAddress` when there are no CC recipients.
- Keep using `ZOHO_FROM_EMAIL` to find the Zoho account ID.

## Email Template Plan

- Keep the current template until the user provides the desired screenshot.
- After the design screenshot is provided:
  - Rebuild `buildReminderEmail` as table-safe HTML with inline CSS.
  - Ensure it renders well in common email clients.
  - Include subscription rows, due dates, prices, and payment status.
  - Keep escaping via `escapeHtml`.
  - Add a text-safe fallback if needed.

## Task Checklist

- [x] Review current reminder settings UI and storage.
- [x] Review current Zoho send-mail implementation.
- [x] Confirm Zoho supports separate `toAddress` and `ccAddress`.
- [x] Decide final persistence model: new table vs JSONB column.
- [x] Add DB migration/init logic for reminder recipients.
- [x] Add runnable SQL for the new table.
- [x] Backfill existing comma-separated emails into recipient records.
- [x] Update reminder settings validation types.
- [x] Update `GET /api/reminder-settings` response shape.
- [x] Update `POST /api/reminder-settings` save logic.
- [x] Replace `ReminderDrawer` with a centered reminder settings modal.
- [x] Add multiple reminder groups.
- [x] Add recipient list UI.
- [x] Add email input and add-as-primary checkbox/toggle.
- [x] Add remove recipient action.
- [x] Add hard delete for recipient rows.
- [x] Add active/inactive recipient toggle.
- [x] Add manual drag ordering for recipients.
- [x] Add primary recipient toggle with exactly-one-primary behavior.
- [x] Update dashboard settings gear to open the new modal.
- [x] Update Zoho send logic to use primary as `toAddress` and other recipients as `ccAddress`.
- [x] Update test script to cover primary and CC delivery.
- [x] Request the email template reference screenshot from the user.
- [x] Rebuild reminder email HTML template from the approved design.
- [ ] Test add/remove/primary save behavior.
- [x] Test reminder delivery with one recipient.
- [ ] Test reminder delivery with primary plus CC recipients.
- [x] Run lint and production build.

## Open Decisions

- Recipient order is manually draggable.
- Removed recipients are hard deleted.
- Recipients can also be marked inactive.
- Multiple reminder groups are supported.
- Should CC recipients be visible to each other, or should future support include BCC?

## References

- Zoho Mail Send Email API: https://www.zoho.com/mail/help/api/post-send-an-email.html
- Zoho Mail Email Messages API overview: https://www.zoho.com/mail/help/api/email-api.html
