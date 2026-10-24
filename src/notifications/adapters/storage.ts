import { randomUUID } from "expo-crypto";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type {
  NotificationPersistence,
  NotificationStorage,
} from "../core/types";

const DATABASE_NAME = "notifications.db";
const ABANDONED_CLAIM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let databasePromise: Promise<SQLiteDatabase> | undefined;

async function openStorage(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(DATABASE_NAME);
  try {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
    `);
    // Acquire the write lock before reading user_version: foreground and
    // headless runtimes can open this database together on first launch.
    // This connection stays private until initialization commits.
    await database.execAsync("BEGIN IMMEDIATE");
    try {
      const version = await database.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
      );
      if ((version?.user_version ?? 0) > 1) {
        throw new Error("Notification storage was created by a newer app version.");
      }
      if ((version?.user_version ?? 0) === 0) {
        await database.execAsync(`
          CREATE TABLE notification_state (
            id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
            value TEXT NOT NULL
          );
          CREATE TABLE notification_events (
            event_key TEXT PRIMARY KEY NOT NULL,
            claim_id TEXT NOT NULL,
            lease_until INTEGER NOT NULL,
            complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
            retain_until INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX notification_events_retention
            ON notification_events (complete, retain_until);
          PRAGMA user_version = 1;
        `);
      }
      await database.execAsync("COMMIT");
    } catch (error) {
      await database.execAsync("ROLLBACK").catch(() => undefined);
      throw error;
    }
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

function getStorage(): Promise<SQLiteDatabase> {
  databasePromise ??= openStorage().catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

function createDefaultState(): NotificationPersistence {
  return {
    version: 1,
    installationId: randomUUID(),
    enabled: false,
    endpoint: null,
    pendingRegistration: null,
    syncedRegistration: null,
    retry: null,
    pendingOpens: [],
  };
}

function parseState(value: string): NotificationPersistence {
  const state: unknown = JSON.parse(value);
  if (
    state === null ||
    typeof state !== "object" ||
    !("version" in state) || state.version !== 1 ||
    !("installationId" in state) || typeof state.installationId !== "string" ||
    state.installationId.length === 0 ||
    !("enabled" in state) || typeof state.enabled !== "boolean" ||
    !("pendingOpens" in state) || !Array.isArray(state.pendingOpens)
  ) {
    throw new Error("Notification storage is invalid or uses an unsupported version.");
  }
  return state as NotificationPersistence;
}

async function pruneEvents(database: SQLiteDatabase, now: number): Promise<void> {
  await database.runAsync(
    `DELETE FROM notification_events
     WHERE (complete = 1 AND retain_until <= ?)
        OR (complete = 0 AND lease_until <= ?)`,
    now,
    now - ABANDONED_CLAIM_RETENTION_MS,
  );
}

export const notificationStorage: NotificationStorage = {
  async load() {
    const database = await getStorage();
    let row = await database.getFirstAsync<{ value: string }>(
      "SELECT value FROM notification_state WHERE id = 1",
    );
    if (!row) {
      // Two runtimes may boot together; the first insert wins the stable ID.
      await database.runAsync(
        "INSERT OR IGNORE INTO notification_state (id, value) VALUES (1, ?)",
        JSON.stringify(createDefaultState()),
      );
      row = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM notification_state WHERE id = 1",
      );
    }
    if (!row) throw new Error("Notification storage could not be initialized.");
    return parseState(row.value);
  },

  async save(state) {
    const database = await getStorage();
    await database.runAsync(
      `INSERT INTO notification_state (id, value) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET value = excluded.value`,
      JSON.stringify(state),
    );
  },

  async claimEvent(key, now, leaseMs) {
    const database = await getStorage();
    // A crashed worker may never complete or see this event again. Bound those
    // rows too, retaining expired leases for the same seven-day dedup window.
    await pruneEvents(database, now);
    const claimId = randomUUID();
    // One SQLite write is the compare-and-set across foreground and headless
    // JS runtimes. A completed event becomes claimable only after retention.
    const result = await database.runAsync(
      `INSERT INTO notification_events
        (event_key, claim_id, lease_until, complete, retain_until)
       VALUES (?, ?, ?, 0, 0)
       ON CONFLICT(event_key) DO UPDATE SET
         claim_id = excluded.claim_id,
         lease_until = excluded.lease_until,
         complete = 0,
         retain_until = 0
       WHERE (notification_events.complete = 0 AND notification_events.lease_until <= ?)
          OR (notification_events.complete = 1 AND notification_events.retain_until <= ?)`,
      key,
      claimId,
      now + leaseMs,
      now,
      now,
    );
    return result.changes === 1 ? claimId : null;
  },

  async completeEvent(key, claimId, retainUntil) {
    const database = await getStorage();
    await database.runAsync(
      `UPDATE notification_events SET complete = 1, lease_until = 0, retain_until = ?
       WHERE event_key = ? AND claim_id = ? AND complete = 0`,
      retainUntil,
      key,
      claimId,
    );
    await pruneEvents(database, Date.now());
  },

  async isEventComplete(key, now) {
    const database = await getStorage();
    const row = await database.getFirstAsync<{ complete: number; retain_until: number }>(
      "SELECT complete, retain_until FROM notification_events WHERE event_key = ?",
      key,
    );
    return row?.complete === 1 && row.retain_until > now;
  },

  async releaseEvent(key, claimId) {
    const database = await getStorage();
    await database.runAsync(
      "DELETE FROM notification_events WHERE event_key = ? AND claim_id = ? AND complete = 0",
      key,
      claimId,
    );
  },
};
