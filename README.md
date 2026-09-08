# SubTrack Pro

SubTrack Pro is a Next.js subscription management app with:

- a dashboard UI for tracking tools and plans
- PostgreSQL-backed subscription and reminder settings APIs
- Zoho Mail reminder sending via OAuth2 REST API
- a daily reminder cron job plus a manual reminder trigger route

## Local Development

Run the app locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

The app expects these environment variables:

```bash
DATABASE_URL=
SUBTRACK_ADMIN_USERNAME=
SUBTRACK_ADMIN_PASSWORD=
CREDENTIAL_ENCRYPTION_KEY=
AUTH_SESSION_SECRET=
REMINDER_CRON_SECRET=
CRON_SECRET=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_FROM_EMAIL=
```

## Short Deployment Note

This app is a full Next.js server app, not static hosting.

Whoever deploys it should:

1. Use the included Vercel Cron config for once-daily production reminders, or deploy to a platform that supports a long-running Node.js process if using the in-app `node-cron` scheduler as-is.
2. Set all required environment variables listed above.
   - On Vercel, set `CRON_SECRET` so Vercel sends `Authorization: Bearer <CRON_SECRET>` to the cron route.
   - `REMINDER_CRON_SECRET` is still supported for manual or third-party cron calls.
3. Confirm the database is reachable from the deployed environment.
4. Verify the manual reminder route works with Basic Auth or a cron bearer token:

```text
POST /api/reminders/send
```

For scheduled jobs, send:

```text
Authorization: Bearer <CRON_SECRET>
```

Expected success response:

```json
{ "success": true, "sent": 0, "emailsSent": 0, "skipped": {} }
```

or:

```json
{ "success": true, "sent": N }
```

where `N` is the number of due subscriptions included in the reminder email.

The included `vercel.json` runs `/api/reminders/send` at `0 7 * * *`, which is 8:00 AM in Africa/Lagos.

## Notes

- Reminder recipient email is read dynamically from the `reminder_settings` table.
- Zoho access tokens are refreshed on demand before each email send.
- Subscriptions marked `Paid` are excluded from reminder emails.
- Non-free subscriptions automatically settle to `Paid` after spending 24 hours
  in `Not Paid`. Recurring subscriptions also advance to their next billing date.
