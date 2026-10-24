import { taskStore } from "@/stores/taskStore";
import { router } from "expo-router";

/** Only app-owned routes can be reached from a remote payload. */
export async function openTaskListFromNotification(taskId?: string): Promise<void> {
  if (taskId) {
    await taskStore.load();
    const exists = taskStore.getSnapshot().tasks.some((task) => task.id === taskId);
    if (exists) {
      router.navigate({ pathname: "/(tabs)", params: { taskId } });
      return;
    }
  }

  // Deleted tasks and general announcements still have a useful destination.
  // An explicit empty value replaces an earlier task selection on this tab.
  router.navigate({ pathname: "/(tabs)", params: { taskId: "" } });
}
