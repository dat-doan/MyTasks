import { taskStore } from "@/stores/taskStore";
import { useEffect, useSyncExternalStore } from "react";

export function useTasks() {
  const state = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot,
  );

  useEffect(() => {
    // The snapshot exposes load failures so the screen can offer a retry.
    void taskStore.load().catch(() => undefined);
  }, []);

  return {
    ...state,
    load: taskStore.load,
    add: taskStore.add,
    rename: taskStore.rename,
    toggle: taskStore.toggle,
    remove: taskStore.remove,
  };
}
