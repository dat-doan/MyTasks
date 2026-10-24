import { processReceipt, withNotificationClaim } from "./background";
import { parseNotification } from "./payload";
import type {
  DeviceRegistration,
  NotificationPermission,
  NotificationPersistence,
  NotificationService,
  NotificationServiceOptions,
  NotificationSnapshot,
  PushEndpoint,
  RawPushMessage,
} from "./types";

const MAX_PENDING_OPENS = 20;

function permissionAllowsNotifications(permission: NotificationPermission): boolean {
  return permission === "granted" || permission === "provisional";
}

function sameEndpoint(a: PushEndpoint | null, b: PushEndpoint | null): boolean {
  return a === b || (a?.provider === b?.provider && a?.kind === b?.kind && a?.value === b?.value);
}

function sameRegistration(a: DeviceRegistration | null, b: DeviceRegistration): boolean {
  return !!a && a.installationId === b.installationId && a.enabled === b.enabled &&
    a.userId === b.userId && sameEndpoint(a.endpoint, b.endpoint);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Notification operation failed.";
}

export function createNotificationService(options: NotificationServiceOptions): NotificationService {
  const { storage, transport } = options;
  const now = options.now ?? Date.now;
  const api = options.registrationApi ?? null;
  const retryBaseMs = options.retryBaseMs ?? 1_000;
  const retryMaxMs = options.retryMaxMs ?? 60_000;
  const maxAutomaticAttempts = options.maxAutomaticAttempts ?? 5;
  const listeners = new Set<() => void>();
  let snapshot: NotificationSnapshot = Object.freeze({
    supported: transport.supported,
    enabled: false,
    permission: transport.supported ? "unknown" : "unsupported",
    registration: "idle",
    backend: api ? "pending" : "not-configured",
    busy: false,
    error: null,
    endpoint: null,
    foregroundNotification: null,
  });
  let state: NotificationPersistence | null = null;
  let loadPromise: Promise<void> | null = null;
  let queue = Promise.resolve();
  let started = false;
  let ready = false;
  let generation = 0;
  let sessionEpoch = 0;
  let userId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let startPromise: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimerEpoch = 0;
  let errorSource: "operation" | "backend" | null = null;

  function publish(
    update: Partial<NotificationSnapshot>,
    source: "operation" | "backend" = "operation",
  ): void {
    if ("error" in update) errorSource = update.error === null ? null : source;
    snapshot = Object.freeze({ ...snapshot, ...update });
    listeners.forEach((listener) => listener());
  }

  function clearRetryTimer(): void {
    retryTimerEpoch += 1;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(): void {
    clearRetryTimer();
    if (!started || !api || !state?.pendingRegistration || !state.retry ||
      state.retry.attempts >= maxAutomaticAttempts) return;
    const scheduledGeneration = generation;
    const scheduledSession = sessionEpoch;
    const scheduledRevision = state.pendingRegistration.revision;
    const scheduledTimer = retryTimerEpoch;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const isCurrent = () => started && generation === scheduledGeneration &&
        sessionEpoch === scheduledSession && retryTimerEpoch === scheduledTimer &&
        state?.pendingRegistration?.revision === scheduledRevision;
      if (!isCurrent()) return;
      void enqueue(async () => {
        if (isCurrent()) await syncRegistration();
      });
    }, Math.max(0, state.retry.nextAttemptAt - now()));
  }

  async function load(): Promise<void> {
    if (state) return;
    loadPromise ??= storage.load().then(async (saved) => {
      const owner = saved.pendingRegistration ? saved.pendingRegistration.userId :
        (saved.syncedRegistration?.userId ?? null);
      let restored = saved;
      if (owner !== userId && saved.pendingOpens.length > 0) {
        restored = { ...saved, pendingOpens: [] };
        await storage.save(restored);
      }
      state = restored;
      publish({
        enabled: saved.enabled,
        endpoint: saved.endpoint ? Object.freeze({ ...saved.endpoint }) : null,
        backend: !api ? "not-configured" : saved.retry ? "error" : saved.pendingRegistration ? "pending" :
          saved.syncedRegistration ? "synced" : "pending",
      });
      scheduleRetry();
    }).catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
    await loadPromise;
  }

  async function persist(update: Partial<NotificationPersistence>): Promise<void> {
    if (!state) throw new Error("Notification state is not initialized.");
    const next = { ...state, ...update };
    // Commit the in-memory version only when the durable write succeeds.
    await storage.save(next);
    state = next;
  }

  function enqueue(operation: () => Promise<void>, busy = false, propagateError = false): Promise<void> {
    const result = queue.then(async () => {
      if (busy) publish({ busy: true, error: null });
      try {
        await load();
        await operation();
      } catch (error) {
        publish({ error: errorMessage(error) });
        if (propagateError) throw error;
      } finally {
        if (busy) publish({ busy: false });
      }
    });
    queue = result.catch(() => undefined);
    return result;
  }

  async function stageRegistration(): Promise<void> {
    if (!state) return;
    const previous = state.pendingRegistration ?? state.syncedRegistration;
    const desired: DeviceRegistration = {
      installationId: state.installationId,
      endpoint: state.endpoint,
      enabled: state.enabled && transport.supported &&
        permissionAllowsNotifications(snapshot.permission) &&
        snapshot.registration === "registered" && !!state.endpoint,
      userId,
      revision: (previous?.revision ?? 0) + 1,
    };
    if (sameRegistration(previous, desired)) return;
    await persist({ pendingRegistration: desired, retry: null });
    clearRetryTimer();
    publish({ backend: api ? "pending" : "not-configured" });
  }

  async function syncRegistration(force = false): Promise<void> {
    if (!state) return;
    if (!api) {
      clearRetryTimer();
      publish({ backend: "not-configured" });
      return;
    }
    const pending = state.pendingRegistration;
    if (!pending) {
      clearRetryTimer();
      publish({ backend: state.syncedRegistration ? "synced" : "pending" });
      return;
    }
    if (!force && state.retry && (
      state.retry.attempts >= maxAutomaticAttempts || state.retry.nextAttemptAt > now()
    )) {
      scheduleRetry();
      return;
    }

    clearRetryTimer();
    publish({ backend: "pending" });
    try {
      await api.sync(pending);
      await persist({ pendingRegistration: null, syncedRegistration: pending, retry: null });
      publish({ backend: "synced", ...(errorSource === "backend" ? { error: null } : {}) });
    } catch (error) {
      const attempts = (state.retry?.attempts ?? 0) + 1;
      const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(attempts - 1, 30));
      await persist({ retry: { attempts, nextAttemptAt: now() + delay } });
      publish({ backend: "error", error: errorMessage(error) }, "backend");
      scheduleRetry();
    }
  }

  async function reconcileRegistration(force = false): Promise<void> {
    if (!state) return;
    if (!transport.supported) {
      publish({ permission: "unsupported", registration: "idle" });
      await stageRegistration();
      await syncRegistration(force);
      return;
    }
    const permission = await transport.getPermission();
    publish({ permission });
    if (state.enabled && permissionAllowsNotifications(permission)) {
      publish({ registration: "registering" });
      try {
        const endpoint = Object.freeze(await transport.getEndpoint());
        if (!sameEndpoint(state.endpoint, endpoint)) await persist({ endpoint });
        publish({ endpoint, registration: "registered" });
      } catch (error) {
        publish({ registration: "error", error: errorMessage(error) });
        // A previous endpoint is not proof the current native registration succeeded.
        await stageRegistration();
        await syncRegistration(force);
        return;
      }
    } else {
      publish({ registration: "idle" });
      if (state.endpoint) {
        try {
          await transport.unregister();
        } catch (error) {
          publish({ error: errorMessage(error) });
        }
      }
    }
    await stageRegistration();
    await syncRegistration(force);
  }

  async function receive(message: RawPushMessage, currentGeneration: number, messageSession: number): Promise<void> {
    if (!started || generation !== currentGeneration || sessionEpoch !== messageSession || !state?.enabled) return;
    const notification = parseNotification(message, now());
    if (!notification) return;
    const received = await processReceipt(
      storage, notification, { source: "foreground" }, options.onReceive, now,
    );
    if (received && started && generation === currentGeneration && sessionEpoch === messageSession && state.enabled) {
      publish({ foregroundNotification: notification });
    }
  }

  async function drainOpens(): Promise<void> {
    if (!started || !ready || !state?.enabled) return;
    while (state.pendingOpens.length > 0 && started && ready && state.enabled) {
      const notification = state.pendingOpens[0];
      // Revalidate expiry because startup/auth can delay navigation substantially.
      if (parseNotification({ data: notification.payload }, now())) {
        const key = `open:${notification.payload.eventId}:default`;
        const opened = await withNotificationClaim(
          storage,
          key,
          now,
          () => options.onOpen(notification),
        );
        // An unfinished worker may still own the lease. Preserve the durable intent
        // for retry/foreground reconciliation instead of mistaking it for a duplicate.
        if (!opened && !await storage.isEventComplete(key, now())) break;
      }
      await persist({ pendingOpens: state.pendingOpens.slice(1) });
      if (snapshot.foregroundNotification?.payload.eventId === notification.payload.eventId) {
        publish({ foregroundNotification: null });
      }
    }
  }

  async function queueOpen(message: RawPushMessage): Promise<void> {
    if (!state?.enabled) return;
    const notification = parseNotification(message, now());
    if (!notification) return;
    if (!state.pendingOpens.some((item) => item.payload.eventId === notification.payload.eventId)) {
      await persist({ pendingOpens: [...state.pendingOpens, notification].slice(-MAX_PENDING_OPENS) });
    }
    await drainOpens();
  }

  const service: NotificationService = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (started) return startPromise ?? Promise.resolve();
      started = true;
      const currentGeneration = ++generation;
      try {
        if (transport.supported) {
          unsubscribe = transport.listen({
            onMessage: (message) => {
              const messageSession = sessionEpoch;
              void enqueue(() => receive(message, currentGeneration, messageSession));
            },
            onOpen: (message) => {
              const messageSession = sessionEpoch;
              if (started && generation === currentGeneration) {
                void enqueue(async () => {
                  if (sessionEpoch === messageSession) await queueOpen(message);
                });
              }
            },
            onEndpointChanged: (endpoint) => {
              if (!started || generation !== currentGeneration) return;
              void enqueue(async () => {
                if (!started || generation !== currentGeneration) return;
                if (!state?.enabled || !permissionAllowsNotifications(snapshot.permission)) return;
                await persist({ endpoint: Object.freeze(endpoint) });
                publish({ endpoint, registration: "registered" });
                await stageRegistration();
                await syncRegistration();
              }, true);
            },
            onError: (error) => {
              if (started && generation === currentGeneration) publish({ error: errorMessage(error) });
            },
          });
        }
      } catch (error) {
        started = false;
        publish({ registration: "error", error: errorMessage(error) });
        return Promise.resolve();
      }
      startPromise = enqueue(async () => {
        if (!started || generation !== currentGeneration) return;
        // Opening a local screen must not wait for registration or an offline API.
        try {
          if (transport.supported && started && generation === currentGeneration) {
            const messageSession = sessionEpoch;
            const initial = await transport.getInitialNotification();
            if (initial && started && generation === currentGeneration && sessionEpoch === messageSession) {
              await queueOpen(initial);
            }
          }
          await drainOpens();
        } catch (error) {
          publish({ error: errorMessage(error) });
        }
        if (started && generation === currentGeneration) await reconcileRegistration();
      }, true);
      return startPromise;
    },
    stop() {
      started = false;
      ready = false;
      generation += 1;
      unsubscribe?.();
      unsubscribe = null;
      startPromise = null;
      clearRetryTimer();
    },
    async enable() {
      if (!started) await service.start();
      if (!started) return;
      await enqueue(async () => {
        if (!state || !transport.supported) return;
        await persist({ enabled: true });
        publish({ enabled: true });
        const permission = await transport.requestPermission();
        publish({ permission });
        await reconcileRegistration(true);
      }, true);
    },
    disable: () => enqueue(async () => {
      if (!state) return;
      await persist({ enabled: false, pendingOpens: [] });
      publish({ enabled: false, registration: "idle", foregroundNotification: null });
      // Persist/stage opt-out before native work, so failures cannot enable processing.
      await stageRegistration();
      let nativeError: unknown;
      if (transport.supported) {
        try { await transport.unregister(); } catch (error) { nativeError = error; }
      }
      await syncRegistration(true);
      if (nativeError) publish({ error: errorMessage(nativeError) });
    }, true),
    reconcile() {
      if (!started) return service.start();
      return enqueue(async () => {
        await reconcileRegistration();
        await drainOpens();
      }, true);
    },
    async retry() {
      if (!started) await service.start();
      if (!started) return;
      await enqueue(async () => {
        await persist({ retry: null });
        await reconcileRegistration(true);
        await drainOpens();
      }, true);
    },
    setSession(nextUserId) {
      const changed = userId !== nextUserId;
      userId = nextUserId;
      if (changed) {
        // Stop navigation immediately, including an open already waiting in the queue.
        ready = false;
        sessionEpoch += 1;
        publish({ foregroundNotification: null });
      }
      return enqueue(async () => {
        if (changed) await persist({ pendingOpens: [] });
        await stageRegistration();
        await syncRegistration(true);
      }, true);
    },
    setReady(nextReady) {
      ready = nextReady;
      if (ready) void enqueue(drainOpens);
    },
    openForeground() {
      // Capture the displayed item before an already queued receipt can replace it.
      const notification = snapshot.foregroundNotification;
      const messageSession = sessionEpoch;
      return enqueue(async () => {
        if (notification && sessionEpoch === messageSession) {
          await queueOpen({ ...notification, data: notification.payload });
        }
      }, false, true);
    },
    dismissForeground: () => publish({ foregroundNotification: null }),
  };
  return service;
}
