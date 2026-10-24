import { beforeEach, expect, it, jest } from "@jest/globals";
import { taskStore } from "@/stores/taskStore";
import { router } from "expo-router";
import { openTaskListFromNotification } from "../navigation";

jest.mock("@/stores/taskStore", () => ({
  taskStore: { load: jest.fn(), getSnapshot: jest.fn() },
}));
jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(taskStore.load).mockResolvedValue(undefined);
  jest.mocked(taskStore.getSnapshot).mockReturnValue({
    status: "ready",
    error: null,
    tasks: [{ id: "existing-task", title: "Task", complete: false, createAt: new Date() }],
  });
});

it("loads task data before selecting a task on the allowed route", async () => {
  await openTaskListFromNotification("existing-task");
  expect(taskStore.load).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: "/(tabs)", params: { taskId: "existing-task" },
  });
});

it("clears earlier selection for announcements and deleted tasks", async () => {
  await openTaskListFromNotification();
  await openTaskListFromNotification("deleted-task");
  expect(router.navigate).toHaveBeenNthCalledWith(1, {
    pathname: "/(tabs)", params: { taskId: "" },
  });
  expect(router.navigate).toHaveBeenNthCalledWith(2, {
    pathname: "/(tabs)", params: { taskId: "" },
  });
});

it("keeps a failed storage lookup retryable without navigating", async () => {
  jest.mocked(taskStore.load).mockRejectedValue(new Error("Database unavailable"));
  await expect(openTaskListFromNotification("existing-task")).rejects.toThrow("Database unavailable");
  expect(router.navigate).not.toHaveBeenCalled();
});
