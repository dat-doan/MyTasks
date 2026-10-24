import type {
  NotificationPayload,
  PushNotification,
  RawPushMessage,
} from "./types";

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

/** Only allow known, versioned intents. Push data can never supply a route or URL. */
export function parseNotification(
  message: RawPushMessage,
  now: number = Date.now(),
): PushNotification | null {
  const data = message.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const input = data as Record<string, unknown>;
  if (input.schemaVersion !== "1" || !identifier(input.eventId)) return null;

  let expiresAt: string | undefined;
  if (input.expiresAt !== undefined) {
    if (
      typeof input.expiresAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.expiresAt)
    ) return null;
    const expiration = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiration) || expiration <= now) return null;
    expiresAt = input.expiresAt;
  }

  const common = {
    schemaVersion: "1" as const,
    eventId: input.eventId,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
  let payload: NotificationPayload;
  if (input.type === "task.reminder" || input.type === "task.updated") {
    if (!identifier(input.taskId)) return null;
    payload = { ...common, type: input.type, taskId: input.taskId };
  } else if (input.type === "announcement") {
    payload = { ...common, type: "announcement" };
  } else {
    return null;
  }

  return Object.freeze({
    payload: Object.freeze(payload),
    ...(typeof message.title === "string" ? { title: message.title.slice(0, 256) } : {}),
    ...(typeof message.body === "string" ? { body: message.body.slice(0, 4096) } : {}),
    ...(typeof message.messageId === "string" ? { messageId: message.messageId } : {}),
  });
}
