/* global __dirname */
// Run with: node --test src/notifications/adapters/firebase.integration.cjs
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadRuntime(expoGo, os, firebase) {
  let imports = 0;
  const source = readFileSync(path.join(__dirname, "firebaseRuntime.native.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const mockedRequire = (name) => {
    if (name === "expo") return { isRunningInExpoGo: () => expoGo };
    if (name === "react-native") return { Platform: { OS: os } };
    if (name === "@react-native-firebase/messaging") {
      imports += 1;
      if (!firebase) throw new Error("Native module missing");
      return firebase;
    }
    throw new Error(`Unexpected dependency ${name}`);
  };
  new Function("require", "module", "exports", outputText)(mockedRequire, module, module.exports);
  return { ...module.exports, getImports: () => imports };
}

function setup(overrides = {}) {
  const callbacks = {};
  const removed = [];
  const calls = [];
  const subscribe = (name, listener) => {
    callbacks[name] = listener;
    return () => removed.push(name);
  };
  const api = {
    isSupported: async () => true,
    isDeviceRegisteredForRemoteMessages: () => false,
    registerDeviceForRemoteMessages: async () => calls.push("apns"),
    setAutoInitEnabled: async (_, enabled) => calls.push(`auto:${enabled}`),
    register: async () => {
      calls.push("register");
      callbacks.registered("native-fid");
    },
    unregister: async () => calls.push("unregister"),
    onRegistered: (_, listener) => subscribe("registered", listener),
    onUnregistered: (_, listener) => subscribe("unregistered", listener),
    onMessage: (_, listener) => subscribe("message", listener),
    onNotificationOpenedApp: (_, listener) => subscribe("open", listener),
    getInitialNotification: async () => null,
    ...overrides,
  };
  const source = readFileSync(path.join(__dirname, "firebase.native.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const mockedRequire = (name) => {
    if (name === "react-native") return { Platform: { OS: "ios" } };
    if (name === "./firebaseRuntime.native") {
      return { getFirebaseRuntime: () => ({ api, messaging: {} }), isNotificationHeadless: async () => false };
    }
    if (name === "./permissions.native") {
      return { getNotificationPermission: async () => "granted", requestNotificationPermission: async () => "granted" };
    }
    throw new Error(`Unexpected dependency ${name}`);
  };
  new Function("require", "module", "exports", outputText)(mockedRequire, module, module.exports);
  return { transport: module.exports.firebaseTransport, calls, callbacks, removed };
}

test("Expo Go and web never import native Firebase; a stale binary remains usable", async () => {
  for (const runtime of [loadRuntime(true, "ios"), loadRuntime(false, "web")]) {
    assert.equal(runtime.getFirebaseRuntime(), null);
    assert.equal(await runtime.isNotificationHeadless(), false);
    assert.equal(runtime.getImports(), 0);
  }
  const missing = loadRuntime(false, "android");
  assert.equal(missing.getFirebaseRuntime(), null);
  assert.equal(missing.getImports(), 1);
});

test("an iOS headless bridge error does not suppress the interactive app", async () => {
  const runtime = loadRuntime(false, "ios", {
    getMessaging: () => ({}),
    getIsHeadless: async () => { throw new Error("Native bridge unavailable"); },
  });
  assert.equal(await runtime.isNotificationHeadless(), false);
});

test("FID registration uses APNs plus modular register and cleans both subscriptions", async () => {
  const { transport, calls, removed } = setup();
  assert.deepEqual(await transport.getEndpoint(), { provider: "fcm", kind: "fid", value: "native-fid" });
  assert.deepEqual(calls, ["apns", "auto:true", "register"]);
  assert.deepEqual(removed.sort(), ["registered", "unregistered"]);
  await transport.unregister();
  assert.deepEqual(calls.slice(-2), ["auto:false", "unregister"]);
});

test("one deadline bounds every asynchronous registration step and removes listeners", async (context) => {
  for (const stage of ["isSupported", "registerDeviceForRemoteMessages", "setAutoInitEnabled", "register"]) {
    await context.test(stage, async (inner) => {
      inner.mock.timers.enable({ apis: ["setTimeout"] });
      const { transport, removed } = setup({ [stage]: () => new Promise(() => {}) });
      const operation = transport.getEndpoint();
      const rejection = assert.rejects(operation, /timed out/);
      // Let the native pipeline advance until its intentionally hanging stage.
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
      inner.mock.timers.tick(20_001);
      await rejection;
      assert.deepEqual(removed.sort(), ["registered", "unregistered"]);
    });
  }
});

test("listener setup failure releases earlier listeners and aborts startup", () => {
  const errors = [];
  const { transport, removed } = setup({ onRegistered: () => { throw new Error("FID disabled"); } });
  assert.throws(() => transport.listen({
    onMessage() {}, onOpen() {}, onEndpointChanged() {}, onError: (error) => errors.push(error),
  }), /FID disabled/);
  assert.equal(errors[0].message, "FID disabled");
  assert.deepEqual(removed.sort(), ["message", "open"]);
});

test("notification receipt and tap preserve the same normalized application payload", async () => {
  const received = [];
  const opened = [];
  const { transport, callbacks } = setup();
  const unsubscribe = transport.listen({
    onMessage: (message) => received.push(message),
    onOpen: (message) => opened.push(message),
    onEndpointChanged() {},
    onError: (error) => { throw error; },
  });
  const raw = {
    data: { schemaVersion: "1", eventId: "event-1", type: "announcement" },
    messageId: "fcm-id", notification: { title: "Title", body: "Body" },
  };
  callbacks.message(raw);
  callbacks.open(raw);
  assert.deepEqual(received, opened);
  assert.deepEqual(received[0], { data: raw.data, messageId: "fcm-id", title: "Title", body: "Body" });
  unsubscribe();
});
