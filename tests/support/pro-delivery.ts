// Helpers of the Pro delivery tests: folders with a repeat schedule in seconds and an operator bot on a fake
// Telegram API, a project with a good and a failing channel, the injected clock as an offset from one start time, the
// failed list and retry commands, and rows of a given age written into the database.
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type FakeChannel, projectSettings } from './lite.ts';
import { createProFolders, type ProFolders, runCli } from './pro.ts';

export const projectKey = 'DeliveryProject1';

const start = new Date('2026-10-14T12:00:00Z');

// The injected clock `seconds` after the start of the test, as FORMGATE_TEST_NOW takes it.
export function at(seconds: number): string {
  return new Date(start.getTime() + seconds * 1000).toISOString().replace('.000Z', 'Z');
}

// Pro folders whose environment has the repeat schedule (seconds, comma separated) and, when given, the operator bot.
export function createDeliveryFolders(schedule: string, operatorBot?: FakeChannel): ProFolders {
  const folders = createProFolders();
  folders.env.FORMGATE_REPEAT_SCHEDULE_SECONDS = schedule;
  if (operatorBot) {
    folders.env.FORMGATE_ALERT_BOT_TOKEN = 'OPERATOR-TOKEN';
    folders.env.FORMGATE_ALERT_CHAT_ID = '-200';
    folders.env.FORMGATE_ALERT_API_URL = operatorBot.url;
  }
  return folders;
}

// The settings of a project with the good channel as `telegram #1` and the failing one as `telegram #2`.
export function twoChannelSettings(good: FakeChannel, failing: FakeChannel) {
  const settings = projectSettings(good);
  return { ...settings, channels: [settings.channels[0], projectSettings(failing).channels[0]] };
}

// Runs a CLI command at the given time of the injected clock.
export function runCommand(folders: ProFolders, args: string[], now: string) {
  return runCli(folders, args, { FORMGATE_TEST_NOW: now });
}

// Writes a delivered request and a spam log entry that came at the given time into the database of the folders.
// The tables exist after the first request was posted.
export function seedEntries(folders: ProFolders, receivedAt: string): void {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'));
  try {
    db.prepare(
      "INSERT INTO queue (project_key, received_at, form, fields, service, status, channels, due_at) VALUES (?, ?, 'old', '{}', '{}', 'delivered', '{}', ?)",
    ).run(projectKey, receivedAt, receivedAt);
    db.prepare("INSERT INTO spam_log (received_at, form, fields, reason) VALUES (?, 'old', '{}', 'honeypot')").run(receivedAt);
  } finally {
    db.close();
  }
}

// The received_at of the requests and of the spam log entries that are in the database now.
export function storedTimes(folders: ProFolders): { requests: string[]; spam: string[] } {
  const db = new DatabaseSync(join(folders.data, 'formgate.sqlite'), { readOnly: true });
  try {
    const times = (table: string) =>
      db.prepare(`SELECT received_at FROM ${table} ORDER BY received_at`).all().map((row) => String(row.received_at));
    return { requests: times('queue'), spam: times('spam_log') };
  } finally {
    db.close();
  }
}
