import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { migrateDatabase } from "./migrations";

const DATABASE_NAME = "my-tasks.db";

let databasePromise: Promise<SQLiteDatabase> | undefined;

async function initializeDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(DATABASE_NAME);

  try {
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);
    await migrateDatabase(database);
    return database;
  } catch (error) {
    // Preserve the initialization error even if releasing the connection fails.
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function getDatabase(): Promise<SQLiteDatabase> {
  // Share both the connection and in-flight initialization across all callers.
  databasePromise ??= initializeDatabase().catch((error) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
}
