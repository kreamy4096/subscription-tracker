import { Pool } from "pg";

let pool: Pool | null = null;
let dbInitialized = false;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing.");
    }

    pool = new Pool({
      connectionString,
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
        ADD COLUMN IF NOT EXISTS login_password_tag TEXT;
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

    dbInitialized = true;
    console.log("Neon database tables verified/created successfully.");
  } catch (error) {
    console.error("Error initializing database tables:", error);
    throw error;
  }
}
