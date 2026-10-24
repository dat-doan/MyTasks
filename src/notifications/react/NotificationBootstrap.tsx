import {
  isNotificationHeadless,
  notificationService,
} from "@/features/notifications/runtime";
import { useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { attachNotificationLifecycle } from "./lifecycle";
import NotificationBanner from "./NotificationBanner";

/** Mount once alongside the root navigator, after app startup is complete. */
export default function NotificationBootstrap() {
  const navigationState = useRootNavigationState();
  const navigationReady = Boolean(navigationState?.key);

  useEffect(() => {
    if (!navigationReady) {
      notificationService.setReady(false);
      return;
    }
    // Drain a cold-start tap before any slow native/backend registration work.
    notificationService.setReady(true);
    const detach = attachNotificationLifecycle({
      service: notificationService,
      isHeadless: isNotificationHeadless,
      subscribeToActive(onActive) {
        const subscription = AppState.addEventListener("change", (state) => {
          if (state === "active") onActive();
        });
        return () => subscription.remove();
      },
    });
    return () => {
      detach();
      notificationService.setReady(false);
    };
  }, [navigationReady]);

  return navigationReady ? <NotificationBanner /> : null;
}
