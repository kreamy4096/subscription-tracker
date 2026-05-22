import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const recipientEmail =
  process.env.TEST_REMINDER_EMAIL || "abdullahajibowu0@gmail.com";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith("#")) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key]) {
      continue;
    }

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is missing.`);
  }
  return value;
}

function getVerifiedConnectionString(connectionString) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

function getReminderEndpoint() {
  const baseUrl = (
    process.env.REMINDER_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  return `${baseUrl}/api/reminders/send`;
}

async function ensureTables(client) {
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tool TEXT NOT NULL,
      subscription TEXT,
      due_date TEXT,
      price TEXT,
      login_email TEXT,
      login_password TEXT,
      login_password_ciphertext TEXT,
      login_password_iv TEXT,
      login_password_tag TEXT,
      action TEXT,
      payment_status TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reminder_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      days_before INTEGER DEFAULT 3,
      enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reminder_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT 'Default',
      days_before INTEGER DEFAULT 3,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reminder_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID,
      email TEXT NOT NULL,
      email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED,
      is_primary BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(`
    ALTER TABLE reminder_recipients
      ADD COLUMN IF NOT EXISTS group_id UUID,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
  `);

  await client.query(`
    DROP INDEX IF EXISTS reminder_recipients_email_normalized_key;
  `);

  await client.query(`
    DROP INDEX IF EXISTS reminder_recipients_one_primary;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_group_email_key
    ON reminder_recipients (group_id, email_normalized);
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_one_primary_per_group
    ON reminder_recipients (group_id)
    WHERE is_primary = true;
  `);
}

async function setReminderRecipient(client) {
  const existing = await client.query("SELECT id FROM reminder_settings LIMIT 1");

  if (existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE reminder_settings
       SET email = $1, days_before = 3, enabled = true, updated_at = now()
       WHERE id = $2`,
      [recipientEmail, id],
    );
  } else {
    await client.query(
      `INSERT INTO reminder_settings (email, days_before, enabled)
       VALUES ($1, 3, true)`,
      [recipientEmail],
    );
  }

  let groupResult = await client.query(
    "SELECT id FROM reminder_groups ORDER BY created_at ASC LIMIT 1",
  );
  if (groupResult.rows.length === 0) {
    groupResult = await client.query(
      `INSERT INTO reminder_groups (name, days_before, enabled)
       VALUES ('Default', 3, true)
       RETURNING id`,
    );
  } else {
    await client.query(
      `UPDATE reminder_groups
       SET name = 'Default', days_before = 3, enabled = true, updated_at = now()
       WHERE id = $1`,
      [groupResult.rows[0].id],
    );
  }

  const groupId = groupResult.rows[0].id;
  await client.query("DELETE FROM reminder_recipients WHERE group_id = $1", [
    groupId,
  ]);
  await client.query(
    `INSERT INTO reminder_recipients (
      group_id,
      email,
      is_primary,
      is_active,
      sort_order
    ) VALUES ($1, $2, true, true, 0)`,
    [groupId, recipientEmail],
  );
}

async function createFakeDueSubscription(client) {
  const now = new Date();
  const dueDate = now.toISOString().slice(0, 10);

  await client.query(
    `DELETE FROM subscriptions
     WHERE tool LIKE '[Cron Test] Zoho Reminder%'
        OR tool = 'Zoho Reminder Test'`,
  );

  const result = await client.query(
    `INSERT INTO subscriptions (
      tool,
      subscription,
      due_date,
      price,
      login_email,
      login_password,
      action,
      payment_status
    )
    VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
    RETURNING id, tool, due_date`,
    [
      "Zoho Reminder Test",
      "Reminder email preview",
      dueDate,
      "$1",
      recipientEmail,
      "Renewal",
      "Not Paid",
    ],
  );

  return result.rows[0];
}

async function triggerReminderEndpoint() {
  const endpoint = getReminderEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("REMINDER_CRON_SECRET")}`,
      "Content-Type": "application/json",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Reminder endpoint failed with ${response.status}: ${body || response.statusText}`,
    );
  }

  return {
    endpoint,
    status: response.status,
    body: body ? JSON.parse(body) : null,
  };
}

loadEnvFile();

const pool = new Pool({
  connectionString: getVerifiedConnectionString(requireEnv("DATABASE_URL")),
  ssl: {
    rejectUnauthorized: true,
  },
});

try {
  const client = await pool.connect();
  try {
    await ensureTables(client);
    await setReminderRecipient(client);
    const fakeSubscription = await createFakeDueSubscription(client);
    const triggerResult = await triggerReminderEndpoint();

    console.log("Reminder email test completed.");
    console.log(`Recipient: ${recipientEmail}`);
    console.log(
      `Fake subscription: ${fakeSubscription.tool} (${fakeSubscription.id}), due ${fakeSubscription.due_date}`,
    );
    console.log(`Triggered endpoint: ${triggerResult.endpoint}`);
    console.log(`Endpoint status: ${triggerResult.status}`);
    console.log("Endpoint response:", triggerResult.body);
    console.log(
      "Check the recipient inbox and Zoho sent mail for the SubTrack Pro reminder email.",
    );
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
