import { Pool } from "pg";

let pool: Pool | null = null;
let dbInitialized = false;

function getVerifiedConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }

    pool = new Pool({
      connectionString: getVerifiedConnectionString(connectionString),
      ssl: {
        rejectUnauthorized: true,
      },
    });
  }

  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const activePool = getPool();
  if (!dbInitialized) {
    await initDb();
  }
  return activePool.query(text, params);
}

export async function initDb() {
  if (dbInitialized) {
    return;
  }

  const activePool = getPool();

  try {
    await activePool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tool TEXT NOT NULL,
        subscription TEXT,
        due_date TEXT,
        billing_type TEXT DEFAULT 'one_time',
        recurrence_day INTEGER,
        next_due_date DATE,
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

    await activePool.query(`
      ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS login_password_ciphertext TEXT,
        ADD COLUMN IF NOT EXISTS login_password_iv TEXT,
        ADD COLUMN IF NOT EXISTS login_password_tag TEXT,
        ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'one_time',
        ADD COLUMN IF NOT EXISTS recurrence_day INTEGER,
        ADD COLUMN IF NOT EXISTS next_due_date DATE;
    `);

    await activePool.query(`
      UPDATE subscriptions
      SET next_due_date = to_date(due_date, 'YYYY-MM-DD')
      WHERE next_due_date IS NULL
        AND due_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND to_char(to_date(due_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = due_date;
    `);

    await activePool.query(`
      UPDATE subscriptions
      SET billing_type = 'one_time'
      WHERE billing_type IS NULL
         OR billing_type NOT IN ('one_time', 'monthly', 'yearly');
    `);

    await activePool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'subscriptions_action_check'
            AND conrelid = 'subscriptions'::regclass
            AND pg_get_constraintdef(oid) NOT LIKE '%PAYG Renewal%'
        ) THEN
          ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_action_check;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'subscriptions_action_check'
            AND conrelid = 'subscriptions'::regclass
        ) THEN
          ALTER TABLE subscriptions
            ADD CONSTRAINT subscriptions_action_check
            CHECK (
              action IS NULL
              OR action IN ('', 'Renewal', 'PAYG Renewal', 'Upgrade', 'Canceled', 'FREE')
            );
        END IF;
      END $$;
    `);

    await activePool.query(`
      COMMENT ON COLUMN subscriptions.login_password
      IS 'Legacy credential storage column. New credentials are stored encrypted.';
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS reminder_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        days_before INTEGER DEFAULT 3,
        enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS reminder_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED,
        is_primary BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS reminder_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'Default',
        days_before INTEGER DEFAULT 3,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      INSERT INTO reminder_groups (name, days_before, enabled)
      SELECT 'Default', COALESCE(days_before, 3), COALESCE(enabled, true)
      FROM reminder_settings
      WHERE NOT EXISTS (SELECT 1 FROM reminder_groups)
      LIMIT 1;
    `);

    await activePool.query(`
      INSERT INTO reminder_groups (name, days_before, enabled)
      SELECT 'Default', 3, true
      WHERE NOT EXISTS (SELECT 1 FROM reminder_groups);
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS reminder_group_subscriptions (
        group_id UUID NOT NULL,
        subscription_id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (group_id, subscription_id)
      );
    `);

    await activePool.query(`
      ALTER TABLE reminder_recipients
        ADD COLUMN IF NOT EXISTS group_id UUID,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
    `);

    await activePool.query(`
      UPDATE reminder_recipients
      SET group_id = (SELECT id FROM reminder_groups ORDER BY created_at ASC LIMIT 1)
      WHERE group_id IS NULL;
    `);

    await activePool.query(`
      ALTER TABLE reminder_recipients
        ALTER COLUMN group_id SET NOT NULL;
    `);

    await activePool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reminder_recipients_group_id_fkey'
            AND conrelid = 'reminder_recipients'::regclass
        ) THEN
          ALTER TABLE reminder_recipients
            ADD CONSTRAINT reminder_recipients_group_id_fkey
            FOREIGN KEY (group_id)
            REFERENCES reminder_groups(id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reminder_group_subscriptions_group_id_fkey'
            AND conrelid = 'reminder_group_subscriptions'::regclass
        ) THEN
          ALTER TABLE reminder_group_subscriptions
            ADD CONSTRAINT reminder_group_subscriptions_group_id_fkey
            FOREIGN KEY (group_id)
            REFERENCES reminder_groups(id)
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reminder_group_subscriptions_subscription_id_fkey'
            AND conrelid = 'reminder_group_subscriptions'::regclass
        ) THEN
          ALTER TABLE reminder_group_subscriptions
            ADD CONSTRAINT reminder_group_subscriptions_subscription_id_fkey
            FOREIGN KEY (subscription_id)
            REFERENCES subscriptions(id)
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await activePool.query(`
      DROP INDEX IF EXISTS reminder_recipients_email_normalized_key;
    `);

    await activePool.query(`
      DROP INDEX IF EXISTS reminder_recipients_one_primary;
    `);

    await activePool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_group_email_key
      ON reminder_recipients (group_id, email_normalized);
    `);

    await activePool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_one_primary_per_group
      ON reminder_recipients (group_id)
      WHERE is_primary = true;
    `);

    await activePool.query(`
      INSERT INTO reminder_recipients (group_id, email, is_primary, is_active, sort_order)
      SELECT
        (SELECT id FROM reminder_groups ORDER BY created_at ASC LIMIT 1),
        email,
        row_number() OVER (ORDER BY ordinal) = 1,
        true,
        ordinal::integer - 1
      FROM (
        SELECT DISTINCT ON (lower(trim(value)))
          trim(value) AS email,
          ordinal
        FROM reminder_settings
        CROSS JOIN LATERAL regexp_split_to_table(email, ',') WITH ORDINALITY AS split(value, ordinal)
        WHERE trim(value) != ''
        ORDER BY lower(trim(value)), ordinal
      ) legacy_emails
      WHERE NOT EXISTS (SELECT 1 FROM reminder_recipients)
      ON CONFLICT (group_id, email_normalized) DO NOTHING;
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS budget_mail_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS budget_mail_settings_singleton
      ON budget_mail_settings ((true));
    `);

    await activePool.query(`
      INSERT INTO budget_mail_settings (enabled)
      SELECT true
      WHERE NOT EXISTS (SELECT 1 FROM budget_mail_settings)
      ON CONFLICT DO NOTHING;
    `);

    await activePool.query(`
      CREATE TABLE IF NOT EXISTS budget_mail_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settings_id UUID NOT NULL REFERENCES budget_mail_settings(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED,
        is_primary BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await activePool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS budget_mail_recipients_email_key
      ON budget_mail_recipients (settings_id, email_normalized);
    `);

    await activePool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS budget_mail_recipients_one_primary
      ON budget_mail_recipients (settings_id)
      WHERE is_primary = true;
    `);

    await activePool.query(`
      WITH distinct_recipients AS (
        SELECT DISTINCT ON (email_normalized)
          email,
          email_normalized,
          sort_order,
          created_at
        FROM reminder_recipients
        WHERE is_active = true
        ORDER BY email_normalized, sort_order ASC, created_at ASC
      ),
      ranked_recipients AS (
        SELECT
          email,
          row_number() OVER (ORDER BY sort_order ASC, created_at ASC, email ASC) AS position
        FROM distinct_recipients
      )
      INSERT INTO budget_mail_recipients (
        settings_id,
        email,
        is_primary,
        is_active,
        sort_order
      )
      SELECT
        (SELECT id FROM budget_mail_settings ORDER BY updated_at ASC LIMIT 1),
        email,
        position = 1,
        true,
        position::integer - 1
      FROM ranked_recipients
      WHERE NOT EXISTS (SELECT 1 FROM budget_mail_recipients)
      ON CONFLICT (settings_id, email_normalized) DO NOTHING;
    `);

    dbInitialized = true;
    console.log("Neon database tables verified/created successfully.");
  } catch (error) {
    console.error("Error initializing database tables:", error);
    throw error;
  }
}
