# Task storage

Tasks are persisted in `my-tasks.db` in Expo SQLite's default database directory.

## Data flow

`MyTasks` → `useTasks` → `taskStore` → `taskRepository` → SQLite

- `src/db/database.ts` shares one asynchronous connection and initialization promise. It enables WAL and foreign keys, runs migrations before exposing the connection, and allows retry after initialization failure.
- `src/db/migrations.ts` applies an ordered migration list and `PRAGMA user_version` in one transaction. Append new migrations; do not edit migrations that have shipped.
- `src/repositories/taskRepository.ts` owns SQL, bound parameters, and conversion between SQLite timestamps/integers and `Task.createAt`/`Task.complete`.
- `src/stores/taskStore.ts` owns the shared in-memory snapshot and serial write queue. UI actions must use the store so its snapshot stays in sync. State changes only after a successful database write. Failed writes reject without changing the snapshot or blocking later writes.
- `src/hooks/useTasks.ts` subscribes through `useSyncExternalStore`. Mounting multiple consumers or returning to a screen reuses the loaded snapshot without another full-table query.

Task reads are ordered by creation time and insertion order for ties. Each mutation changes only its row in SQLite; the store preserves the object references of unchanged tasks. Titles are trimmed before saving. The existing public `Task.createAt: Date` model is preserved.

The add/edit forms wait for successful writes before clearing or closing. Loading failures show a retry action; write failures keep the current data and form draft.

## Validation

```sh
npm run test:storage
npm run lint
npx tsc --noEmit
```

Storage tests use Node 24's built-in `node:sqlite` module. They run the actual migrations/repository against a temporary, file-backed SQLite database through an Expo API adapter, and test the store with controlled asynchronous repository responses. They do not replace validation of the Expo native module on a device.

Device smoke test: add tasks, edit a title, toggle completion, delete a task, fully close and reopen the app, and verify the remaining titles, completion states, dates, and order are preserved.

The current integration targets Android/iOS. Expo SQLite web requires additional WASM/HTTP-header setup: see the [SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#web-setup).
