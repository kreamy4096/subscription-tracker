import { NextResponse } from "next/server";
import { parseReminderSettingsInput } from "@/lib/api-validation";
import { requireBasicAuth } from "@/lib/auth";
import { getPool, query } from "@/lib/db";

interface ReminderRecipientRow {
  id: string;
  group_id: string;
  email: string;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

interface ReminderGroupSubscriptionRow {
  group_id: string;
  subscription_id: string;
}

function isUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

async function ensureDefaultReminderGroup() {
  const result = await query(
    "SELECT id FROM reminder_groups ORDER BY created_at ASC LIMIT 1",
  );
  if (result.rows.length > 0) {
    return;
  }

  const settingsResult = await query(
    "SELECT email, days_before, enabled FROM reminder_settings LIMIT 1",
  );
  const settings = settingsResult.rows[0];
  await query(
    `INSERT INTO reminder_groups (name, days_before, enabled)
     VALUES ($1, $2, $3)`,
    [
      "Default",
      Number(settings?.days_before ?? 3),
      settings?.enabled === undefined ? true : Boolean(settings.enabled),
    ],
  );
}

async function getReminderSettingsPayload() {
  await ensureDefaultReminderGroup();

  const settingsResult = await query(
    "SELECT id, email, days_before, enabled, updated_at FROM reminder_settings LIMIT 1",
  );

  let settings = settingsResult.rows[0];
  if (!settings) {
    const insertResult = await query(
      `INSERT INTO reminder_settings (email, days_before, enabled)
       VALUES ($1, $2, $3) RETURNING *`,
      ["admin@apollo.io", 3, true],
    );
    settings = insertResult.rows[0];
  }

  const groupsResult = await query(
    `SELECT id, name, days_before, enabled, created_at, updated_at
     FROM reminder_groups
     ORDER BY created_at ASC, name ASC`,
  );
  const recipientsResult = await query(
    `SELECT id, group_id, email, is_primary, is_active, sort_order, created_at, updated_at
     FROM reminder_recipients
     ORDER BY sort_order ASC, created_at ASC, email ASC`,
  );
  const groupSubscriptionsResult = await query(
    `SELECT group_id, subscription_id
     FROM reminder_group_subscriptions
     ORDER BY group_id ASC, subscription_id ASC`,
  );
  const recipients = recipientsResult.rows as ReminderRecipientRow[];
  const groupSubscriptions =
    groupSubscriptionsResult.rows as ReminderGroupSubscriptionRow[];
  const groups = groupsResult.rows.map((group) => ({
    ...group,
    recipients: recipients.filter((recipient) => recipient.group_id === group.id),
    subscription_ids: groupSubscriptions
      .filter((item) => item.group_id === group.id)
      .map((item) => item.subscription_id),
  }));

  return {
    ...settings,
    groups,
    recipients: groups[0]?.recipients ?? [],
  };
}

export async function GET(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    return NextResponse.json(await getReminderSettingsPayload());
  } catch (error: unknown) {
    console.error("API Error in GET /api/reminder-settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authError = requireBasicAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const parsed = parseReminderSettingsInput(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await query("SELECT 1");

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const firstGroup = parsed.data.groups[0];
      const legacyEmail = firstGroup.recipients
        .map((recipient) => recipient.email)
        .join(", ");
      const checkResult = await client.query(
        "SELECT id FROM reminder_settings LIMIT 1",
      );

      if (checkResult.rows.length > 0) {
        await client.query(
          `UPDATE reminder_settings SET
            email = $1,
            days_before = $2,
            enabled = $3,
            updated_at = now()
           WHERE id = $4`,
          [
            legacyEmail,
            firstGroup.days_before,
            firstGroup.enabled,
            checkResult.rows[0].id,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO reminder_settings (email, days_before, enabled)
           VALUES ($1, $2, $3)`,
          [legacyEmail, firstGroup.days_before, firstGroup.enabled],
        );
      }

      const savedGroupIds: string[] = [];

      for (const group of parsed.data.groups) {
        let groupId = group.id;
        if (isUuid(groupId)) {
          const updateResult = await client.query(
            `UPDATE reminder_groups SET
              name = $1,
              days_before = $2,
              enabled = $3,
              updated_at = now()
             WHERE id = $4
             RETURNING id`,
            [group.name, group.days_before, group.enabled, groupId],
          );

          if (updateResult.rowCount === 0) {
            groupId = undefined;
          }
        } else {
          groupId = undefined;
        }

        if (!groupId) {
          const insertResult = await client.query(
            `INSERT INTO reminder_groups (name, days_before, enabled)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [group.name, group.days_before, group.enabled],
          );
          groupId = insertResult.rows[0].id as string;
        }

        savedGroupIds.push(groupId);

        await client.query(
          "UPDATE reminder_recipients SET is_primary = false WHERE group_id = $1",
          [groupId],
        );

        const savedRecipientIds: string[] = [];
        for (const recipient of group.recipients) {
          let recipientId = recipient.id;
        if (isUuid(recipientId)) {
            const updateResult = await client.query(
              `UPDATE reminder_recipients SET
                email = $1,
                is_primary = $2,
                is_active = $3,
                sort_order = $4,
                updated_at = now()
               WHERE id = $5 AND group_id = $6
               RETURNING id`,
              [
                recipient.email,
                recipient.is_primary,
                recipient.is_active,
                recipient.sort_order,
                recipientId,
                groupId,
              ],
            );

            if (updateResult.rowCount === 0) {
              recipientId = undefined;
            }
          } else {
            recipientId = undefined;
          }

          if (!recipientId) {
            const insertResult = await client.query(
              `INSERT INTO reminder_recipients (
                group_id,
                email,
                is_primary,
                is_active,
                sort_order
              ) VALUES ($1, $2, $3, $4, $5)
              RETURNING id`,
              [
                groupId,
                recipient.email,
                recipient.is_primary,
                recipient.is_active,
                recipient.sort_order,
              ],
            );
            recipientId = insertResult.rows[0].id as string;
          }

          savedRecipientIds.push(recipientId);
        }

        if (savedRecipientIds.length > 0) {
          await client.query(
            `DELETE FROM reminder_recipients
             WHERE group_id = $1 AND NOT (id = ANY($2::uuid[]))`,
            [groupId, savedRecipientIds],
          );
        } else {
          await client.query("DELETE FROM reminder_recipients WHERE group_id = $1", [
            groupId,
          ]);
        }

        const subscriptionIds = group.subscription_ids.filter((id) => isUuid(id));
        if (subscriptionIds.length > 0) {
          await client.query(
            "DELETE FROM reminder_group_subscriptions WHERE group_id = $1",
            [groupId],
          );
          await client.query(
            `INSERT INTO reminder_group_subscriptions (group_id, subscription_id)
             SELECT $1, subscription_id
             FROM unnest($2::uuid[]) AS subscription_id
             ON CONFLICT (group_id, subscription_id) DO NOTHING`,
            [groupId, subscriptionIds],
          );
        } else {
          await client.query(
            "DELETE FROM reminder_group_subscriptions WHERE group_id = $1",
            [groupId],
          );
        }
      }

      await client.query(
        `DELETE FROM reminder_groups
         WHERE NOT (id = ANY($1::uuid[]))`,
        [savedGroupIds],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json(await getReminderSettingsPayload());
  } catch (error: unknown) {
    console.error("API Error in POST /api/reminder-settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
