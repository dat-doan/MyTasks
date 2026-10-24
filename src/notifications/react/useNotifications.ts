import { notificationService } from "@/features/notifications/runtime";
import { useSyncExternalStore } from "react";

/** All screens share one subscription lifecycle owned by NotificationBootstrap. */
export function useNotifications() {
  const state = useSyncExternalStore(
    notificationService.subscribe,
    notificationService.getSnapshot,
    notificationService.getSnapshot,
  );

  return {
    ...state,
    enable: notificationService.enable,
    disable: notificationService.disable,
    retry: notificationService.retry,
    reconcile: notificationService.reconcile,
    openForeground: notificationService.openForeground,
    dismissForeground: notificationService.dismissForeground,
  };
}
