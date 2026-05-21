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
REMINDER_CRON_SECRET=
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_FROM_EMAIL=
```

## Short Deployment Note

This app is a full Next.js server app, not static hosting.

Whoever deploys it should:

1. Deploy it to a platform that supports a long-running Node.js process if using the in-app `node-cron` scheduler as-is.
2. Set all required environment variables listed above.
3. Confirm the database is reachable from the deployed environment.
4. Verify the manual reminder route works with Basic Auth or a cron bearer token:

```text
POST /api/reminders/send
```

For scheduled jobs, send:

```text
Authorization: Bearer <REMINDER_CRON_SECRET>
```

Expected success response:

```json
{ "success": true, "sent": 0 }
```

or:

```json
{ "success": true, "sent": N }
```

where `N` is the number of due subscriptions included in the reminder email.

## Notes

- Reminder recipient email is read dynamically from the `reminder_settings` table.
- Zoho access tokens are refreshed on demand before each email send.
- Subscriptions marked `Paid` are excluded from reminder emails.
