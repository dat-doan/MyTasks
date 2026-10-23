const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");

// Run the real TypeScript modules without requiring a native Expo runtime.
// Only platform boundaries are replaced; SQL executes against SQLite on disk.
function createLoader(mocks = {}) {
  const cache = new Map();

  function load(filename) {
    const resolved = path.resolve(projectRoot, filename);
    if (cache.has(resolved)) return cache.get(resolved).exports;

    const module = { exports: {} };
    cache.set(resolved, module);
    const { outputText } = ts.transpileModule(readFileSync(resolved, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: resolved,
    });

    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith("@/") || id.startsWith(".")) {
        const target = id.startsWith("@/")
          ? path.join(projectRoot, "src", id.slice(2))
          : path.resolve(path.dirname(resolved), id);
        if (Object.hasOwn(mocks, target)) return mocks[target];
        return load(path.extname(target) ? target : `${target}.ts`);
      }
      return require(id);
    }

    new Function("require", "module", "exports", outputText)(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }

  return load;
}

function adaptDatabase(database) {
  return {
    execAsync: async (sql) => database.exec(sql),
    getFirstAsync: async (sql, ...params) =>
      database.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) =>
      database.prepare(sql).all(...params),
    runAsync: async (sql, ...params) => {
      const result = database.prepare(sql).run(...params);
      return {
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    closeAsync: async () => database.close(),
    withTransactionAsync: async (operation) => {
      database.exec("BEGIN");
      try {
        await operation();
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function createDatabaseHarness(context, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "my-tasks-storage-"));
  const connections = [];
  let openCount = 0;

  const sqlite = {
    async openDatabaseAsync(name) {
      openCount += 1;
      if (options.failFirstOpen && openCount === 1) {
        throw new Error("Database unavailable");
      }
      const database = new DatabaseSync(path.join(directory, name));
      connections.push(database);
      const adapter = adaptDatabase(database);
      if (options.failFirstMigration && openCount === 1) {
        return {
          ...adapter,
          execAsync: async (sql) => {
            await adapter.execAsync(sql);
            if (sql.includes("CREATE TABLE")) {
              throw new Error("Migration interrupted");
            }
          },
        };
      }
      return adapter;
    },
  };

  context.after(() => {
    for (const database of connections) {
      if (database.isOpen) database.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    load: () => createLoader({ "expo-sqlite": sqlite }),
    get openCount() {
      return openCount;
    },
    get connections() {
      return connections;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeTask(id, title = id, complete = false) {
  return { id, title, complete, createAt: new Date("2026-10-22T12:00:00Z") };
}

function createStore(repository) {
  let nextId = 0;
  return createLoader({
    "@/repositories/taskRepository": { taskRepository: repository },
    "expo-crypto": { randomUUID: () => `task-${++nextId}` },
  })("src/stores/taskStore.ts").taskStore;
}

test("tasks survive reopening with dates, booleans, title binding and stable order", async (context) => {
  const harness = createDatabaseHarness(context);
  const firstLoad = harness.load();
  const { taskRepository } = firstLoad("src/repositories/taskRepository.ts");
  const first = makeTask("first", "O'Brien'); DROP TABLE tasks; -- 📝");
  const second = makeTask("second", "Tiếng Việt", true);

  await taskRepository.create(first);
  await taskRepository.create(second);
  assert.deepEqual(await taskRepository.list(), [first, second]);
  await taskRepository.rename(first.id, "Đã đổi tên 'quoted'");
  assert.equal(await taskRepository.toggle(first.id), true);

  const { getDatabase } = firstLoad("src/db/database.ts");
  await (await getDatabase()).closeAsync();

  const reopenedRepository = harness.load()(
    "src/repositories/taskRepository.ts",
  ).taskRepository;
  assert.deepEqual(await reopenedRepository.list(), [
    { ...first, title: "Đã đổi tên 'quoted'", complete: true },
    second,
  ]);
  await reopenedRepository.remove(first.id);
  await reopenedRepository.remove(first.id);
  assert.deepEqual(await reopenedRepository.list(), [second]);
});

test("parallel toggles use the persisted value without lost updates", async (context) => {
  const harness = createDatabaseHarness(context);
  const { taskRepository } = harness.load()(
    "src/repositories/taskRepository.ts",
  );
  await taskRepository.create(makeTask("toggle"));

  const results = await Promise.all(
    Array.from({ length: 20 }, () => taskRepository.toggle("toggle")),
  );
  assert.deepEqual(
    results,
    Array.from({ length: 20 }, (_, index) => index % 2 === 0),
  );
  assert.equal((await taskRepository.list())[0].complete, false);
});

test("invalid writes and missing updates fail without changing stored tasks", async (context) => {
  const harness = createDatabaseHarness(context);
  const { taskRepository } = harness.load()(
    "src/repositories/taskRepository.ts",
  );
  const existing = makeTask("existing");
  await taskRepository.create(existing);

  await assert.rejects(taskRepository.create(makeTask("blank", " \n ")));
  await assert.rejects(
    taskRepository.create({ ...makeTask("invalid"), createAt: new Date(NaN) }),
  );
  await assert.rejects(taskRepository.create(existing));
  await assert.rejects(taskRepository.rename(existing.id, "  "));
  await assert.rejects(taskRepository.rename("missing", "New title"));
  await assert.rejects(taskRepository.toggle("missing"));
  assert.deepEqual(await taskRepository.list(), [existing]);
});

test("initialization is shared, migrations are idempotent and WAL is enabled", async (context) => {
  const harness = createDatabaseHarness(context);
  const load = harness.load();
  const { getDatabase } = load("src/db/database.ts");
  const { migrateDatabase } = load("src/db/migrations.ts");
  const [first, second] = await Promise.all([getDatabase(), getDatabase()]);

  assert.equal(first, second);
  assert.equal(harness.openCount, 1);
  assert.equal((await first.getFirstAsync("PRAGMA journal_mode")).journal_mode, "wal");
  assert.equal((await first.getFirstAsync("PRAGMA foreign_keys")).foreign_keys, 1);
  await first.runAsync(
    "INSERT INTO tasks (id, title, created_at) VALUES (?, ?, ?)",
    "saved",
    "Preserve me",
    1,
  );
  await migrateDatabase(first);
  assert.equal((await first.getFirstAsync("PRAGMA user_version")).user_version, 1);
  assert.equal((await first.getAllAsync("SELECT * FROM tasks")).length, 1);
});

test("a failed database open can be retried", async (context) => {
  const harness = createDatabaseHarness(context, { failFirstOpen: true });
  const { getDatabase } = harness.load()("src/db/database.ts");

  await assert.rejects(getDatabase(), /Database unavailable/);
  const database = await getDatabase();
  assert.equal(harness.openCount, 2);
  assert.equal((await database.getFirstAsync("PRAGMA user_version")).user_version, 1);
});

test("failed migrations roll back schema and version before retry", async (context) => {
  const database = new DatabaseSync(":memory:");
  context.after(() => database.close());
  const adapter = adaptDatabase(database);
  const { migrateDatabase } = createLoader()("src/db/migrations.ts");
  const failingAdapter = {
    ...adapter,
    execAsync: async (sql) => {
      await adapter.execAsync(sql);
      if (sql.includes("CREATE TABLE")) throw new Error("Migration interrupted");
    },
  };

  await assert.rejects(migrateDatabase(failingAdapter), /Migration interrupted/);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 0);
  assert.equal(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get(),
    undefined,
  );
  await migrateDatabase(adapter);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
});

test("failed initialization closes its connection and can migrate on retry", async (context) => {
  const harness = createDatabaseHarness(context, { failFirstMigration: true });
  const { getDatabase } = harness.load()("src/db/database.ts");

  await assert.rejects(getDatabase(), /Migration interrupted/);
  assert.equal(harness.connections[0].isOpen, false);
  const database = await getDatabase();
  assert.equal(harness.openCount, 2);
  assert.equal((await database.getFirstAsync("PRAGMA user_version")).user_version, 1);
});

test("unsupported future schema versions are rejected without rewriting data", async (context) => {
  const database = new DatabaseSync(":memory:");
  context.after(() => database.close());
  database.exec("CREATE TABLE future_tasks (title TEXT); PRAGMA user_version = 99");
  const { migrateDatabase } = createLoader()("src/db/migrations.ts");

  await assert.rejects(migrateDatabase(adaptDatabase(database)), /newer/);
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, 99);
  assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE name = 'future_tasks'").get());
});

test("store shares hydration and caches it across subscribers and remounts", async () => {
  const hydration = deferred();
  let reads = 0;
  const existing = makeTask("existing");
  const store = createStore({
    list: () => {
      reads += 1;
      return hydration.promise;
    },
    create: async () => undefined,
  });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  const first = store.load();
  assert.equal(store.load(), first);
  assert.equal(reads, 1);
  hydration.resolve([existing]);
  await first;
  const readySnapshot = store.getSnapshot();

  assert.equal(readySnapshot.status, "ready");
  assert.deepEqual(readySnapshot.tasks, [existing]);
  assert.equal(readySnapshot, store.getSnapshot());
  await store.load();
  assert.equal(reads, 1);
  assert.equal(readySnapshot, store.getSnapshot());

  unsubscribe();
  const notificationsBeforeUnmount = notifications;
  await store.add("After unmount");
  await store.load();
  assert.equal(notifications, notificationsBeforeUnmount);
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().tasks.length, 2);
});

test("writes wait for hydration so initial rows cannot overwrite new tasks", async () => {
  const hydration = deferred();
  const existing = makeTask("existing");
  const writes = [];
  const store = createStore({
    list: () => hydration.promise,
    create: async (task) => writes.push(task),
  });

  const adding = store.add("  Newly added  ");
  await Promise.resolve();
  assert.equal(writes.length, 0);
  assert.deepEqual(store.getSnapshot().tasks, []);
  hydration.resolve([existing]);
  await adding;

  assert.equal(writes[0].title, "Newly added");
  assert.deepEqual(store.getSnapshot().tasks, [existing, writes[0]]);
});

test("store serializes rapid writes and publishes the value returned by SQLite", async () => {
  const firstWrite = deferred();
  const writeStarted = deferred();
  const row = makeTask("existing");
  const calls = [];
  let activeWrites = 0;
  let maxActiveWrites = 0;
  let complete = row.complete;

  async function write(label, change) {
    calls.push(label);
    activeWrites += 1;
    maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
    if (calls.length === 1) {
      writeStarted.resolve();
      await firstWrite.promise;
    }
    const result = change();
    activeWrites -= 1;
    return result;
  }

  const store = createStore({
    list: async () => [row],
    rename: (id, title) => write(`rename:${title}`, () => undefined),
    toggle: () => write("toggle", () => (complete = !complete)),
    remove: () => write("remove", () => undefined),
  });
  await store.load();
  const beforeWrite = store.getSnapshot();
  const renaming = store.rename(row.id, "Renamed");
  const toggling = store.toggle(row.id);
  const togglingAgain = store.toggle(row.id);
  const removing = store.remove(row.id);
  await writeStarted.promise;

  assert.deepEqual(calls, ["rename:Renamed"]);
  assert.equal(store.getSnapshot(), beforeWrite);
  firstWrite.resolve();
  await Promise.all([renaming, toggling, togglingAgain, removing]);
  assert.deepEqual(calls, ["rename:Renamed", "toggle", "toggle", "remove"]);
  assert.equal(maxActiveWrites, 1);
  assert.equal(complete, false);
  assert.deepEqual(store.getSnapshot().tasks, []);
});

test("a failed write preserves the snapshot and does not poison queued writes", async () => {
  const failure = new Error("Disk full");
  const firstWrite = deferred();
  const writeStarted = deferred();
  const secondWrite = deferred();
  let writes = 0;
  const store = createStore({
    list: async () => [makeTask("existing")],
    create: async () => {
      writes += 1;
      if (writes === 1) {
        writeStarted.resolve();
        await firstWrite.promise;
      } else {
        await secondWrite.promise;
      }
    },
  });
  await store.load();
  const beforeWrite = store.getSnapshot();
  const failing = assert.rejects(store.add("Failed"), failure);
  await writeStarted.promise;
  const succeeding = store.add("Successful");
  assert.equal(store.getSnapshot(), beforeWrite);
  firstWrite.reject(failure);
  await failing;
  assert.equal(store.getSnapshot(), beforeWrite);

  secondWrite.resolve();
  await succeeding;
  assert.equal(writes, 2);
  assert.deepEqual(
    store.getSnapshot().tasks.map((task) => task.title),
    ["existing", "Successful"],
  );
});

test("load failures are observable and a later write can retry hydration", async () => {
  const failure = new Error("Database busy");
  const existing = makeTask("existing");
  let reads = 0;
  const store = createStore({
    list: async () => {
      reads += 1;
      if (reads === 1) throw failure;
      return [existing];
    },
    create: async () => undefined,
  });

  await assert.rejects(store.load(), failure);
  assert.equal(store.getSnapshot().status, "error");
  assert.equal(store.getSnapshot().error, failure);
  assert.deepEqual(store.getSnapshot().tasks, []);
  await store.add("After retry");
  assert.equal(reads, 2);
  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().error, null);
  assert.equal(store.getSnapshot().tasks[0], existing);
  assert.equal(store.getSnapshot().tasks[1].title, "After retry");
});

test("task updates preserve other row identities and rejected updates stay unchanged", async () => {
  const first = makeTask("first");
  const second = makeTask("second");
  const failure = new Error("Write failed");
  const store = createStore({
    list: async () => [first, second],
    rename: async () => undefined,
    // SQLite is authoritative even if its result differs from a local flip.
    toggle: async () => false,
    remove: async () => {
      throw failure;
    },
  });
  await store.load();
  await store.rename(first.id, "Updated");
  let tasks = store.getSnapshot().tasks;
  assert.notEqual(tasks[0], first);
  assert.equal(tasks[0].title, "Updated");
  assert.equal(tasks[1], second);

  await store.toggle(first.id);
  tasks = store.getSnapshot().tasks;
  assert.equal(tasks[0].complete, false);
  assert.equal(tasks[1], second);
  const beforeFailure = store.getSnapshot();
  await assert.rejects(store.remove(first.id), failure);
  assert.equal(store.getSnapshot(), beforeFailure);
});

test("blank titles never reach storage and valid titles are normalized", async () => {
  let reads = 0;
  const written = [];
  const store = createStore({
    list: async () => {
      reads += 1;
      return [];
    },
    create: async (task) => written.push(task.title),
    rename: async (id, title) => written.push(title),
  });

  await assert.rejects(store.add(" \n "));
  await assert.rejects(store.rename("missing", "  "));
  assert.equal(reads, 0);
  assert.deepEqual(written, []);
  await store.add("  Clean title  ");
  const id = store.getSnapshot().tasks[0].id;
  await store.rename(id, "  Updated title \n");
  assert.deepEqual(written, ["Clean title", "Updated title"]);
});
