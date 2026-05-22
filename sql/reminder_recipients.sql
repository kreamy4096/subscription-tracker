CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS reminder_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Default',
  days_before INTEGER DEFAULT 3,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

INSERT INTO reminder_groups (name, days_before, enabled)
SELECT 'Default', COALESCE(days_before, 3), COALESCE(enabled, true)
FROM reminder_settings
WHERE NOT EXISTS (SELECT 1 FROM reminder_groups)
LIMIT 1;

INSERT INTO reminder_groups (name, days_before, enabled)
SELECT 'Default', 3, true
WHERE NOT EXISTS (SELECT 1 FROM reminder_groups);

ALTER TABLE reminder_recipients
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

UPDATE reminder_recipients
SET group_id = (SELECT id FROM reminder_groups ORDER BY created_at ASC LIMIT 1)
WHERE group_id IS NULL;

ALTER TABLE reminder_recipients
  ALTER COLUMN group_id SET NOT NULL;

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
END $$;

DROP INDEX IF EXISTS reminder_recipients_email_normalized_key;
DROP INDEX IF EXISTS reminder_recipients_one_primary;

CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_group_email_key
ON reminder_recipients (group_id, email_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS reminder_recipients_one_primary_per_group
ON reminder_recipients (group_id)
WHERE is_primary = true;

INSERT INTO reminder_recipients (
  group_id,
  email,
  is_primary,
  is_active,
  sort_order
)
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
