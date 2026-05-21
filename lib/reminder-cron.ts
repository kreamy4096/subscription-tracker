import cron from "node-cron";
import { sendDueReminders } from "@/lib/reminders";

declare global {
  var __subtrackReminderCronStarted: boolean | undefined;
}

export function startReminderCron() {
  if (globalThis.__subtrackReminderCronStarted) {
    return;
  }

  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        const result = await sendDueReminders();
        console.log(
          `SubTrack Pro reminder cron completed. Sent reminders for ${result.sent} subscription(s).`,
        );
      } catch (error) {
        console.error("SubTrack Pro reminder cron failed:", error);
      }
    },
    {
      timezone: "Africa/Lagos",
    },
  );

  globalThis.__subtrackReminderCronStarted = true;
}
