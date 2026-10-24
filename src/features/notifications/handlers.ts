import type {
  NotificationHandlers,
  NotificationPayload,
  PushNotification,
  ReceiptContext,
} from "@/notifications/core/types";

type NotificationType = NotificationPayload["type"];
type DomainHandler = {
  receive?: (
    notification: PushNotification,
    context: ReceiptContext,
  ) => void | Promise<void>;
  open: (notification: PushNotification) => void | Promise<void>;
};

type Dependencies = {
  openTasks: (taskId?: string) => void | Promise<void>;
  /** Supply a repository refresh when tasks gain a server data source. */
  refreshTasks?: () => void | Promise<void>;
};

export function createAppNotificationHandlers({
  openTasks,
  refreshTasks,
}: Dependencies): NotificationHandlers {
  const openTask = (notification: PushNotification) =>
    openTasks(notification.payload.taskId);
  const handlers: Record<NotificationType, DomainHandler> = {
    "task.reminder": { open: openTask },
    "task.updated": {
      receive: () => refreshTasks?.(),
      open: openTask,
    },
    announcement: { open: () => openTasks() },
  };

  return {
    onReceive: (notification, context) =>
      handlers[notification.payload.type].receive?.(notification, context),
    onOpen: (notification) => handlers[notification.payload.type].open(notification),
  };
}
