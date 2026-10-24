import { expect, jest, test } from "@jest/globals";
import { createBackgroundProcessor } from "../background";
import { createNotificationService } from "../createNotificationService";
import { parseNotification } from "../payload";
import type {
  DeviceRegistration,
  NotificationPermission,
  NotificationPersistence,
  NotificationStorage,
  NotificationTransport,
  PushEndpoint,
  RawPushMessage,
  TransportListeners,
} from "../types";

const endpoint: PushEndpoint = { provider: "fcm", kind: "fid", value: "installation-fid-1" };
const message = (eventId = "event-1"): RawPushMessage => ({
  title: "Task reminder",
  body: "Review your tasks",
  data: { schemaVersion: "1", type: "task.reminder", eventId, taskId: "task-1" },
});

function memoryStorage(enabled = false) {
  let saved: NotificationPersistence = {
    version: 1,
    installationId: "local-installation-1",
    enabled,
    endpoint: null,
    pendingRegistration: null,
    syncedRegistration: null,
    retry: null,
    pendingOpens: [],
  };
  type Event = { claimId: string; leaseUntil: number; retainUntil: number; complete: boolean };
  const events = new Map<string, Event>();
  let nextClaimId = 0;
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const storage: NotificationStorage = {
    load: jest.fn(async () => copy(saved)),
    save: jest.fn(async (state: NotificationPersistence) => { saved = copy(state); }),
    claimEvent: jest.fn(async (key: string, now: number, leaseMs: number) => {
      const previous = events.get(key);
      if (previous && (previous.complete ? previous.retainUntil > now : previous.leaseUntil > now)) return null;
      const claimId = `lease-${++nextClaimId}`;
      events.set(key, { claimId, leaseUntil: now + leaseMs, retainUntil: 0, complete: false });
      return claimId;
    }),
    completeEvent: jest.fn(async (key: string, claimId: string, retainUntil: number) => {
      const previous = events.get(key);
      if (previous?.claimId === claimId) events.set(key, { ...previous, retainUntil, complete: true });
    }),
    releaseEvent: jest.fn(async (key: string, claimId: string) => {
      if (events.get(key)?.claimId === claimId) events.delete(key);
    }),
    isEventComplete: jest.fn(async (key: string, now: number) => {
      const previous = events.get(key);
      return !!previous?.complete && previous.retainUntil > now;
    }),
  };
  return { storage, get saved() { return saved; } };
}

function harness(options: { enabled?: boolean; api?: boolean; maxAutomaticAttempts?: number } = {}) {
  const store = memoryStorage(options.enabled);
  let clock = Date.parse("2026-10-24T12:00:00Z");
  let permission: NotificationPermission = "granted";
  let currentEndpoint = endpoint;
  let initial: RawPushMessage | null = null;
  const subscriptions = new Set<TransportListeners>();
  const transport: NotificationTransport = {
    supported: true,
    getPermission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    getEndpoint: jest.fn(async () => currentEndpoint),
    unregister: jest.fn(async () => undefined),
    listen: jest.fn((listeners: TransportListeners) => {
      subscriptions.add(listeners);
      return () => { subscriptions.delete(listeners); };
    }),
    getInitialNotification: jest.fn(async () => initial),
  };
  const sync = jest.fn(async (_registration: DeviceRegistration): Promise<void> => undefined);
  const onReceive = jest.fn(async () => undefined);
  const onOpen = jest.fn(async () => undefined);
  const service = createNotificationService({
    storage: store.storage,
    transport,
    registrationApi: options.api === false ? null : { sync },
    onReceive,
    onOpen,
    now: () => clock,
    maxAutomaticAttempts: options.maxAutomaticAttempts,
  });
  return {
    service, transport, store, sync, onReceive, onOpen, subscriptions,
    setPermission(value: NotificationPermission) { permission = value; },
    setInitial(value: RawPushMessage | null) { initial = value; },
    advance(ms: number) { clock += ms; },
    emitMessage(value = message()) { subscriptions.forEach((listeners) => listeners.onMessage(value)); },
    emitOpen(value = message()) { subscriptions.forEach((listeners) => listeners.onOpen(value)); },
    emitEndpoint(value: PushEndpoint) {
      currentEndpoint = value;
      subscriptions.forEach((listeners) => listeners.onEndpointChanged(value));
    },
  };
}

test("decoder rejects unsupported, malformed and expired intents and never trusts payload routes", () => {
  expect(parseNotification({ data: { schemaVersion: "2", eventId: "x", type: "announcement" } })).toBeNull();
  expect(parseNotification({ data: { schemaVersion: "1", eventId: "x", type: "task.updated" } })).toBeNull();
  expect(parseNotification({ data: { schemaVersion: "1", eventId: "x", type: "open-url", url: "https://example.com" } })).toBeNull();
  expect(parseNotification({ data: { schemaVersion: "1", eventId: "x", type: "announcement", expiresAt: "2020-01-01T00:00:00Z" } })).toBeNull();
  const parsed = parseNotification({ data: {
    schemaVersion: "1", eventId: "x", type: "announcement", route: "/unsafe", taskId: "unexpected",
  } });
  expect(parsed?.payload).toEqual({ schemaVersion: "1", eventId: "x", type: "announcement" });
  expect(Object.isFrozen(parsed?.payload)).toBe(true);
});

test("startup is passive; denial persists user preference without registering a native endpoint", async () => {
  const h = harness();
  h.setPermission("denied");
  await h.service.start();
  expect(h.transport.requestPermission).not.toHaveBeenCalled();
  await h.service.enable();
  expect(h.service.getSnapshot()).toMatchObject({ enabled: true, permission: "denied", registration: "idle" });
  expect(h.store.saved.enabled).toBe(true);
  expect(h.transport.getEndpoint).not.toHaveBeenCalled();
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false, endpoint: null });
  h.service.stop();
});

test("native registration and backend configuration have separate truthful statuses", async () => {
  const h = harness({ enabled: true, api: false });
  await h.service.start();
  expect(h.service.getSnapshot()).toMatchObject({ registration: "registered", backend: "not-configured", endpoint });
  expect(h.store.saved.pendingRegistration).toMatchObject({ enabled: true, endpoint });
  expect(h.store.saved.syncedRegistration).toBeNull();
  const snapshot = h.service.getSnapshot();
  expect(snapshot).toBe(h.service.getSnapshot());
  expect(Object.isFrozen(snapshot)).toBe(true);
  h.service.stop();
});

test("backend failures remain durable, obey bounded backoff and can be retried explicitly", async () => {
  const h = harness({ enabled: true, maxAutomaticAttempts: 2 });
  h.sync.mockRejectedValue(new Error("Offline"));
  await h.service.start();
  expect(h.sync).toHaveBeenCalledTimes(1);
  expect(h.service.getSnapshot().backend).toBe("error");
  expect(h.store.saved.retry).toMatchObject({ attempts: 1 });
  await h.service.reconcile();
  expect(h.sync).toHaveBeenCalledTimes(1);
  h.advance(1_000);
  await h.service.reconcile();
  expect(h.sync).toHaveBeenCalledTimes(2);
  h.advance(120_000);
  await h.service.reconcile();
  expect(h.sync).toHaveBeenCalledTimes(2);
  h.sync.mockResolvedValue(undefined);
  await h.service.retry();
  expect(h.sync).toHaveBeenCalledTimes(3);
  expect(h.service.getSnapshot().backend).toBe("synced");
  expect(h.store.saved.pendingRegistration).toBeNull();
  h.service.stop();
});

test("FID changes update the durable backend registration with an increasing revision", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  const firstRevision = h.sync.mock.calls.at(-1)![0].revision;
  const rotated: PushEndpoint = { ...endpoint, value: "installation-fid-2" };
  h.emitEndpoint(rotated);
  await h.service.reconcile();
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ endpoint: rotated, revision: firstRevision + 1 });
  expect(h.store.saved.endpoint).toEqual(rotated);
  h.service.stop();
});

test("receipt and opening are deduplicated separately, including background processing", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  h.service.setReady(true);
  const background = createBackgroundProcessor({ storage: h.store.storage, onReceive: h.onReceive });
  await background(message());
  h.emitMessage();
  h.emitMessage();
  h.emitOpen();
  h.emitOpen();
  await h.service.reconcile();
  expect(h.onReceive).toHaveBeenCalledTimes(1);
  expect(h.onReceive.mock.calls[0]).toEqual([expect.anything(), { source: "background" }]);
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  h.service.stop();
});

test("cold-start opening persists until the application explicitly becomes ready", async () => {
  const h = harness({ enabled: true });
  h.setInitial(message());
  await h.service.start();
  expect(h.onOpen).not.toHaveBeenCalled();
  expect(h.store.saved.pendingOpens).toHaveLength(1);
  h.service.setReady(true);
  await h.service.reconcile();
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  expect(h.store.saved.pendingOpens).toHaveLength(0);
  h.service.stop();
});

test("a busy open lease preserves the intent until a later reconciliation", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  await h.store.storage.claimEvent("open:event-1:default", Date.parse("2026-10-24T12:00:00Z"), 60_000);
  h.service.setReady(true);
  h.emitOpen();
  await h.service.reconcile();
  expect(h.onOpen).not.toHaveBeenCalled();
  expect(h.store.saved.pendingOpens).toHaveLength(1);
  h.advance(60_001);
  await h.service.reconcile();
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  expect(h.store.saved.pendingOpens).toHaveLength(0);
  h.service.stop();
});

test("failed navigation releases its claim and can be retried from the foreground banner", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  h.service.setReady(true);
  h.emitMessage();
  await h.service.reconcile();
  h.onOpen.mockRejectedValueOnce(new Error("Navigator not available"));
  await expect(h.service.openForeground()).rejects.toThrow("Navigator not available");
  expect(h.service.getSnapshot().foregroundNotification?.payload.eventId).toBe("event-1");
  await h.service.openForeground();
  expect(h.onOpen).toHaveBeenCalledTimes(2);
  expect(h.service.getSnapshot().foregroundNotification).toBeNull();
  h.service.stop();
});

test("foreground open captures the notification the user pressed before the next receipt replaces it", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  h.service.setReady(true);
  h.emitMessage(message("A"));
  await h.service.reconcile();
  h.emitMessage(message("B"));
  const opening = h.service.openForeground();
  await opening;
  expect(h.onOpen).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ eventId: "A" }) }));
  expect(h.service.getSnapshot().foregroundNotification?.payload.eventId).toBe("B");
  h.service.stop();
});

test("disable persists opt-out before native unregister and suppresses future processing", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  const unregister = h.transport.unregister as jest.Mock;
  unregister.mockImplementation(async () => {
    expect(h.store.saved.enabled).toBe(false);
    throw new Error("Native unavailable");
  });
  await h.service.disable();
  expect(h.service.getSnapshot()).toMatchObject({ enabled: false, registration: "idle", backend: "synced" });
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  h.emitMessage();
  h.emitOpen();
  const background = createBackgroundProcessor({ storage: h.store.storage, onReceive: h.onReceive });
  await background(message());
  await h.service.reconcile();
  expect(h.onReceive).not.toHaveBeenCalled();
  expect(h.onOpen).not.toHaveBeenCalled();
  h.service.stop();
});

test("start/stop survives StrictMode without duplicate or stale listeners", async () => {
  const h = harness({ enabled: true });
  const firstStart = h.service.start();
  const stale = [...h.subscriptions][0];
  expect(h.service.start()).toBe(firstStart);
  h.service.stop();
  const secondStart = h.service.start();
  await Promise.all([firstStart, secondStart]);
  h.service.setReady(true);
  expect(h.subscriptions.size).toBe(1);
  stale.onMessage(message("stale"));
  stale.onOpen(message("stale"));
  h.emitMessage(message("current"));
  await h.service.reconcile();
  expect(h.onReceive).toHaveBeenCalledTimes(1);
  expect(h.service.getSnapshot().foregroundNotification?.payload.eventId).toBe("current");
  h.service.stop();
  expect(h.subscriptions.size).toBe(0);
});

test("new session/opt-out revision follows an in-flight old backend request", async () => {
  const h = harness({ enabled: true });
  let release: (() => void) | undefined;
  const inFlight = new Promise<void>((resolve) => { release = resolve; });
  h.sync.mockImplementationOnce(() => inFlight);
  const starting = h.service.start();
  // Wait for the first request, not a wall-clock timeout.
  for (let i = 0; i < 20 && h.sync.mock.calls.length === 0; i++) await Promise.resolve();
  expect(h.sync).toHaveBeenCalledTimes(1);
  const binding = h.service.setSession("user-2");
  const disabling = h.service.disable();
  release!();
  await Promise.all([starting, binding, disabling]);
  const registrations = h.sync.mock.calls.map(([registration]) => registration);
  expect(registrations.at(-1)).toMatchObject({ userId: "user-2", enabled: false });
  expect(registrations.map((registration) => registration.revision)).toEqual([1, 2, 3]);
  h.service.stop();
});

test("session changes clear old account intents and gate queued receipts before navigation is ready again", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  h.emitOpen(message("old-open"));
  await h.service.reconcile();
  expect(h.store.saved.pendingOpens).toHaveLength(1);
  h.emitMessage(message("queued-old-receipt"));
  await h.service.setSession("new-user");
  expect(h.store.saved.pendingOpens).toHaveLength(0);
  expect(h.service.getSnapshot().foregroundNotification).toBeNull();
  h.service.setReady(true);
  await h.service.reconcile();
  expect(h.onReceive).not.toHaveBeenCalled();
  expect(h.onOpen).not.toHaveBeenCalled();
  h.emitOpen(message("new-open"));
  await h.service.reconcile();
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  h.service.stop();
});

test("a backend success cannot hide a native registration failure", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  (h.transport.getEndpoint as jest.Mock<NotificationTransport["getEndpoint"]>)
    .mockRejectedValueOnce(new Error("Native registration unavailable"));
  await h.service.reconcile();
  expect(h.service.getSnapshot()).toMatchObject({
    registration: "error", backend: "synced", error: "Native registration unavailable",
  });
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  h.service.stop();
});

test("OS permission revocation suspends delivery and regrant reconciles without prompting", async () => {
  const h = harness({ enabled: true });
  await h.service.start();
  h.setPermission("denied");
  await h.service.reconcile();
  expect(h.service.getSnapshot()).toMatchObject({ enabled: true, permission: "denied", registration: "idle" });
  expect(h.transport.unregister).toHaveBeenCalledTimes(1);
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  h.setPermission("granted");
  await h.service.reconcile();
  expect(h.sync.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: true });
  expect(h.transport.requestPermission).not.toHaveBeenCalled();
  h.service.stop();
});

test("a running service retries the persisted backend command without repeating native work", async () => {
  jest.useFakeTimers();
  const h = harness({ enabled: true });
  try {
    h.sync.mockRejectedValueOnce(new Error("Offline"));
    await h.service.start();
    const permissionCalls = (h.transport.getPermission as jest.Mock).mock.calls.length;
    const registrationCalls = (h.transport.getEndpoint as jest.Mock).mock.calls.length;
    h.advance(1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(h.sync).toHaveBeenCalledTimes(2);
    expect(h.service.getSnapshot()).toMatchObject({ backend: "synced", error: null });
    expect(h.transport.getPermission).toHaveBeenCalledTimes(permissionCalls);
    expect(h.transport.getEndpoint).toHaveBeenCalledTimes(registrationCalls);
    expect(h.transport.requestPermission).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    h.service.stop();
    jest.useRealTimers();
  }
});

test("automatic retry timers stop at the attempt cap", async () => {
  jest.useFakeTimers();
  const h = harness({ enabled: true, maxAutomaticAttempts: 2 });
  try {
    h.sync.mockRejectedValue(new Error("Offline"));
    await h.service.start();
    h.advance(1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(h.sync).toHaveBeenCalledTimes(2);
    expect(h.store.saved.retry?.attempts).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
    h.advance(120_000);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(h.sync).toHaveBeenCalledTimes(2);
  } finally {
    h.service.stop();
    jest.useRealTimers();
  }
});

test("stop cancels retries and a new service resumes the persisted remaining backoff", async () => {
  jest.useFakeTimers();
  const h = harness({ enabled: true });
  let restarted: ReturnType<typeof createNotificationService> | undefined;
  let clock = Date.parse("2026-10-24T12:00:00Z");
  try {
    h.sync.mockRejectedValueOnce(new Error("Offline"));
    await h.service.start();
    h.service.stop();
    expect(jest.getTimerCount()).toBe(0);
    clock += 500;
    restarted = createNotificationService({
      transport: h.transport,
      storage: h.store.storage,
      registrationApi: { sync: h.sync },
      onOpen: h.onOpen,
      now: () => clock,
    });
    await restarted.start();
    expect(h.sync).toHaveBeenCalledTimes(1);
    clock += 499;
    await jest.advanceTimersByTimeAsync(499);
    expect(h.sync).toHaveBeenCalledTimes(1);
    clock += 1;
    await jest.advanceTimersByTimeAsync(1);
    expect(h.sync).toHaveBeenCalledTimes(2);
    expect(restarted.getSnapshot().backend).toBe("synced");
  } finally {
    restarted?.stop();
    h.service.stop();
    jest.useRealTimers();
  }
});

test("a new opt-out command replaces and cancels the old retry timer", async () => {
  jest.useFakeTimers();
  const h = harness({ enabled: true });
  try {
    h.sync.mockRejectedValueOnce(new Error("Offline"));
    await h.service.start();
    expect(jest.getTimerCount()).toBe(1);
    await h.service.disable();
    expect(h.sync).toHaveBeenCalledTimes(2);
    expect(h.sync.mock.calls[1][0]).toMatchObject({ enabled: false, revision: 2 });
    expect(jest.getTimerCount()).toBe(0);
    h.advance(60_000);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(h.sync).toHaveBeenCalledTimes(2);
  } finally {
    h.service.stop();
    jest.useRealTimers();
  }
});

test("a successful backend timer retry preserves an unrelated native listener error", async () => {
  jest.useFakeTimers();
  const h = harness({ enabled: true });
  try {
    h.sync.mockRejectedValueOnce(new Error("Offline"));
    await h.service.start();
    h.subscriptions.forEach((listener) => listener.onError(new Error("Native listener failed")));
    h.advance(1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(h.service.getSnapshot()).toMatchObject({ backend: "synced", error: "Native listener failed" });
  } finally {
    h.service.stop();
    jest.useRealTimers();
  }
});

test("cold-start navigation does not wait for native endpoint registration", async () => {
  const h = harness({ enabled: true });
  let completeRegistration: ((value: PushEndpoint) => void) | undefined;
  (h.transport.getEndpoint as jest.Mock<NotificationTransport["getEndpoint"]>)
    .mockImplementationOnce(() => new Promise<PushEndpoint>((resolve) => { completeRegistration = resolve; }));
  h.setInitial(message());
  h.service.setReady(true);
  const starting = h.service.start();
  for (let i = 0; i < 30 && !completeRegistration; i++) await Promise.resolve();
  expect(completeRegistration).toBeDefined();
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  expect(h.sync).not.toHaveBeenCalled();
  completeRegistration!(endpoint);
  await starting;
  expect(h.service.getSnapshot().registration).toBe("registered");
  h.service.stop();
});

test.each(["retry", "enable"] as const)("%s recovers failed startup listeners before registering", async (action) => {
  const h = harness({ enabled: true });
  (h.transport.listen as jest.Mock<NotificationTransport["listen"]>)
    .mockImplementationOnce(() => { throw new Error("Listener setup failed"); });
  await h.service.start();
  expect(h.service.getSnapshot()).toMatchObject({ registration: "error", error: "Listener setup failed" });
  expect(h.transport.getEndpoint).not.toHaveBeenCalled();
  await h.service[action]();
  expect(h.transport.listen).toHaveBeenCalledTimes(2);
  expect(h.subscriptions.size).toBe(1);
  expect(h.service.getSnapshot().registration).toBe("registered");
  h.service.setReady(true);
  h.emitMessage();
  h.emitOpen();
  await h.service.reconcile();
  expect(h.onReceive).toHaveBeenCalledTimes(1);
  expect(h.onOpen).toHaveBeenCalledTimes(1);
  h.service.stop();
});

test("persistent listener failure cannot be hidden by enable or retry registration", async () => {
  const h = harness({ enabled: true });
  (h.transport.listen as jest.Mock<NotificationTransport["listen"]>)
    .mockImplementation(() => { throw new Error("Listener setup failed"); });
  await h.service.start();
  await h.service.retry();
  await h.service.enable();
  expect(h.transport.getEndpoint).not.toHaveBeenCalled();
  expect(h.transport.requestPermission).not.toHaveBeenCalled();
  expect(h.service.getSnapshot()).toMatchObject({ registration: "error", error: "Listener setup failed" });
  h.service.stop();
});

test("an endpoint callback queued before stop cannot write from its stale generation", async () => {
  const h = harness({ enabled: true });
  const firstStart = h.service.start();
  [...h.subscriptions][0].onEndpointChanged({ ...endpoint, value: "stale-fid" });
  h.service.stop();
  const nextStart = h.service.start();
  await Promise.all([firstStart, nextStart]);
  expect(h.sync.mock.calls.some(([registration]) => registration.endpoint?.value === "stale-fid")).toBe(false);
  expect(h.service.getSnapshot().endpoint).toEqual(endpoint);
  h.service.stop();
});
