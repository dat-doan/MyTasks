/* global __dirname */
// Run with: node --test src/notifications/adapters/storage.integration.cjs
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const ts = require("typescript");

function createHarness(context) {
  const directory = mkdtempSync(path.join(tmpdir(), "notification-storage-"));
  const connections = [];
  context.after(() => {
    connections.forEach((connection) => connection.close());
    rmSync(directory, { recursive: true, force: true });
  });

  function load() {
    const sqlite = {
      async openDatabaseAsync(name) {
        const connection = new DatabaseSync(path.join(directory, name));
        connections.push(connection);
        const adapter = {
          execAsync: async (sql) => connection.exec(sql),
          getFirstAsync: async (sql, ...params) => connection.prepare(sql).get(...params) ?? null,
          runAsync: async (sql, ...params) => connection.prepare(sql).run(...params),
          closeAsync: async () => connection.close(),
          async withTransactionAsync(operation) {
            connection.exec("BEGIN");
            try {
              await operation();
              connection.exec("COMMIT");
            } catch (error) {
              connection.exec("ROLLBACK");
              throw error;
            }
          },
        };
        return adapter;
      },
    };
    const source = readFileSync(path.join(__dirname, "storage.ts"), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    const mockedRequire = (name) => {
      if (name === "expo-sqlite") return sqlite;
      if (name === "expo-crypto") return { randomUUID };
      throw new Error(`Unexpected native dependency ${name}`);
    };
    new Function("require", "module", "exports", outputText)(mockedRequire, module, module.exports);
    return module.exports.notificationStorage;
  }
  return {
    load,
    eventKeys: () => connections[0].prepare("SELECT event_key FROM notification_events ORDER BY event_key").all().map((row) => row.event_key),
  };
}

test("preferences, pending retry and stable identity survive a new runtime", async (context) => {
  const harness = createHarness(context);
  const first = harness.load();
  const original = await first.load();
  assert.equal(original.enabled, false);
  assert.ok(original.installationId);
  const desired = {
    ...original,
    enabled: true,
    endpoint: { provider: "fcm", kind: "fid", value: "registered-fid" },
    retry: { attempts: 2, nextAttemptAt: Date.now() + 1_000 },
  };
  await first.save(desired);
  assert.deepEqual(await harness.load().load(), desired);
});

test("separate runtimes atomically contend for one event and retries recover released claims", async (context) => {
  const harness = createHarness(context);
  const first = harness.load();
  const second = harness.load();
  await first.load();
  await second.load();
  const now = Date.now();
  assert.equal(await first.isEventComplete("received:event-1", now), false);
  const [one, two] = await Promise.all([
    first.claimEvent("received:event-1", now, 10_000),
    second.claimEvent("received:event-1", now, 10_000),
  ]);
  assert.equal([one, two].filter(Boolean).length, 1);
  assert.equal(await first.isEventComplete("received:event-1", now), false);
  await first.releaseEvent("received:event-1", one ?? two);
  assert.ok(await second.claimEvent("received:event-1", now, 10_000));
});

test("expired workers cannot complete or release a replacement lease; open and receive stay distinct", async (context) => {
  const harness = createHarness(context);
  const first = harness.load();
  const second = harness.load();
  await first.load();
  await second.load();
  const now = Date.now();
  const stale = await first.claimEvent("received:event-2", now, 10);
  const current = await second.claimEvent("received:event-2", now + 11, 1_000);
  assert.ok(stale);
  assert.ok(current);
  assert.notEqual(current, stale);
  await first.releaseEvent("received:event-2", stale);
  await first.completeEvent("received:event-2", stale, now + 60_000);
  assert.equal(await first.claimEvent("received:event-2", now + 12, 1_000), null);
  await second.releaseEvent("received:event-2", current);
  const successful = await second.claimEvent("received:event-2", now + 13, 1_000);
  await second.completeEvent("received:event-2", successful, now + 60_000);
  assert.equal(await first.isEventComplete("received:event-2", now + 2_000), true);
  assert.equal(await first.isEventComplete("received:event-2", now + 60_001), false);
  assert.equal(await first.claimEvent("received:event-2", now + 2_000, 1_000), null);
  assert.ok(await first.claimEvent("opened:event-2", now + 2_000, 1_000));
  assert.ok(await first.claimEvent("received:event-2", now + 60_001, 1_000));
});

test("unrelated claims prune abandoned leases after seven days while retaining recent retries", async (context) => {
  const harness = createHarness(context);
  const storage = harness.load();
  const day = 24 * 60 * 60 * 1_000;
  const now = Date.now();
  const stale = await storage.claimEvent("abandoned", now - 8 * day, 1_000);
  const recent = await storage.claimEvent("retryable", now - day, 1_000);
  const active = await storage.claimEvent("active", now, day);
  await storage.claimEvent("new", now + 1_000, 1_000);
  assert.deepEqual(harness.eventKeys(), ["active", "new", "retryable"]);
  // A late abandoned worker cannot recreate its removed row.
  await storage.completeEvent("abandoned", stale, now + day);
  await storage.releaseEvent("retryable", "wrong-owner");
  assert.deepEqual(harness.eventKeys(), ["active", "new", "retryable"]);
  assert.ok(recent);
  assert.ok(active);
});
