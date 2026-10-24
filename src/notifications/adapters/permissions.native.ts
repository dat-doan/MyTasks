import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

import type { NotificationPermission } from "../core/types";

type NotificationsApi = typeof import("expo-notifications");

function normalizePermission(
  permissions: Awaited<ReturnType<NotificationsApi["getPermissionsAsync"]>>,
  api: NotificationsApi,
): NotificationPermission {
  if (permissions.ios?.status === api.IosAuthorizationStatus.PROVISIONAL) {
    return "provisional";
  }
  if (permissions.granted) return "granted";
  if (permissions.status === "denied") return "denied";
  return "not-determined";
}

async function loadNotifications(): Promise<NotificationsApi | null> {
  if (isRunningInExpoGo()) return null;
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  return import("expo-notifications");
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  const api = await loadNotifications();
  if (!api) return "unsupported";
  return normalizePermission(await api.getPermissionsAsync(), api);
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const api = await loadNotifications();
  if (!api) return "unsupported";

  // Android 13 requires a channel before it can show its notification prompt.
  if (Platform.OS === "android") {
    await api.setNotificationChannelAsync("tasks", {
      name: "Tasks",
      importance: api.AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const current = await api.getPermissionsAsync();
  if (!current.canAskAgain || current.granted) {
    return normalizePermission(current, api);
  }
  return normalizePermission(
    await api.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
    api,
  );
}
