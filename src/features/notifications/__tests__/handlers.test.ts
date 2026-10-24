import type { PushNotification } from "@/notifications/core/types";
import { expect, it, jest } from "@jest/globals";
import { createAppNotificationHandlers } from "../handlers";

const notification: PushNotification = {
  payload: {
    schemaVersion: "1",
    eventId: "event-123",
    type: "task.updated",
    taskId: "task-123",
  },
};

it("refreshes authoritative data on updates without navigating on receipt", async () => {
  const openTasks = jest.fn<(taskId?: string) => void>();
  const refreshTasks = jest.fn<() => void>();
  const handlers = createAppNotificationHandlers({ openTasks, refreshTasks });
  await handlers.onReceive?.(notification, { source: "background" });
  expect(refreshTasks).toHaveBeenCalledTimes(1);
  expect(openTasks).not.toHaveBeenCalled();
});

it("opens only the app-owned task destination", async () => {
  const openTasks = jest.fn<(taskId?: string) => void>();
  const handlers = createAppNotificationHandlers({ openTasks });
  await handlers.onOpen(notification);
  expect(openTasks).toHaveBeenCalledWith("task-123");
  await handlers.onOpen({
    payload: { schemaVersion: "1", eventId: "event-456", type: "announcement" },
  });
  expect(openTasks).toHaveBeenLastCalledWith();
});

it("does not apply task changes from notification payloads", async () => {
  const refreshTasks = jest.fn<() => void>();
  const handlers = createAppNotificationHandlers({ openTasks: jest.fn<(taskId?: string) => void>(), refreshTasks });
  await handlers.onReceive?.({
    ...notification,
    payload: { ...notification.payload, type: "task.reminder", taskId: "task-123" },
  }, { source: "foreground" });
  expect(refreshTasks).not.toHaveBeenCalled();
});
