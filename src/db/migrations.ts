import type { SQLiteDatabase } from "expo-sqlite";

// Append migrations; never change a migration that has already shipped.
const migrations: readonly string[] = [
  `
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
      created_at INTEGER NOT NULL
    );

    CREATE INDEX tasks_created_at_idx ON tasks (created_at);
  `,
];

export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  // The connection stays private until initialization resolves, so unrelated
  // queries cannot join this transaction. This API also works on web.
  await database.withTransactionAsync(async () => {
    const result = await database.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );
    const currentVersion = result?.user_version ?? 0;

    if (currentVersion > migrations.length) {
      throw new Error(
        `Database version ${currentVersion} is newer than the supported version ${migrations.length}.`,
      );
    }

    for (let version = currentVersion; version < migrations.length; version++) {
      await database.execAsync(migrations[version]);
      // The version comes from this migration list, never user input.
      await database.execAsync(`PRAGMA user_version = ${version + 1}`);
    }
  });
}
