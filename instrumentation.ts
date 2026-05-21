import { startReminderCron } from "@/lib/reminder-cron";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    startReminderCron();
  }
}
