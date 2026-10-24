import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import type { Messaging } from "@react-native-firebase/messaging";

type FirebaseMessagingApi = typeof import("@react-native-firebase/messaging");

export type FirebaseRuntime = {
  api: FirebaseMessagingApi;
  messaging: Messaging;
};

let runtime: FirebaseRuntime | undefined;

/** Importing Firebase eagerly throws in Expo Go or an older development binary. */
export function getFirebaseRuntime(): FirebaseRuntime | null {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  if (isRunningInExpoGo()) return null;
  if (runtime) return runtime;

  try {
    // Keep this require behind the native capability guard; a type import is safe.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@react-native-firebase/messaging") as FirebaseMessagingApi;
    runtime = { api, messaging: api.getMessaging() };
    return runtime;
  } catch {
    // Missing native modules / Google service config should not stop task usage.
    return null;
  }
}

export async function isNotificationHeadless(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const firebase = getFirebaseRuntime();
  return firebase
    ? firebase.api.getIsHeadless(firebase.messaging).catch(() => false)
    : false;
}
