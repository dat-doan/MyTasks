import { parseNotification } from "./payload";
import type {
  NotificationHandlers,
  NotificationStorage,
  PushNotification,
  RawPushMessage,
  ReceiptContext,
} from "./types";

const EVENT_LEASE_MS = 60_000;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** A lease prevents concurrent workers; handlers must also tolerate crash/retry. */
export async function withNotificationClaim(
  storage: NotificationStorage,
  key: string,
  now: () => number,
  handle: () => void | Promise<void>,
): Promise<boolean> {
  const claimId = await storage.claimEvent(key, now(), EVENT_LEASE_MS);
  if (!claimId) return false;
  try {
    await handle();
    await storage.completeEvent(key, claimId, now() + EVENT_RETENTION_MS);
    return true;
  } catch (error) {
    await storage.releaseEvent(key, claimId).catch(() => undefined);
    throw error;
  }
}

export function processReceipt(
  storage: NotificationStorage,
  notification: PushNotification,
  context: ReceiptContext,
  onReceive: NotificationHandlers["onReceive"],
  now: () => number,
): Promise<boolean> {
  return withNotificationClaim(
    storage,
    `receipt:${notification.payload.eventId}`,
    now,
    () => onReceive?.(notification, context),
  );
}

/** No React, navigation, banners, permission prompts, or native registration here. */
export function createBackgroundProcessor(options: {
  storage: NotificationStorage;
  onReceive?: NotificationHandlers["onReceive"];
  now?: () => number;
}): (message: RawPushMessage) => Promise<void> {
  const now = options.now ?? Date.now;
  return async (message) => {
    const notification = parseNotification(message, now());
    if (!notification) return;
    const state = await options.storage.load();
    if (!state.enabled) return;
    await processReceipt(
      options.storage,
      notification,
      { source: "background" },
      options.onReceive,
      now,
    );
  };
}
