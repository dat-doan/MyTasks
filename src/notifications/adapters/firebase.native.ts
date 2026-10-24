import type { RemoteMessage } from "@react-native-firebase/messaging";
import { Platform } from "react-native";

import type {
  NotificationTransport,
  PushEndpoint,
  RawPushMessage,
  TransportListeners,
} from "../core/types";
import { getFirebaseRuntime } from "./firebaseRuntime.native";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "./permissions.native";

export { isNotificationHeadless } from "./firebaseRuntime.native";

const REGISTRATION_TIMEOUT_MS = 20_000;

export function normalizeFirebaseMessage(
  message: RemoteMessage,
): RawPushMessage {
  return {
    data: message.data,
    messageId: message.messageId,
    title: message.notification?.title,
    body: message.notification?.body,
  };
}

function getRequiredRuntime() {
  const firebase = getFirebaseRuntime();
  if (!firebase) {
    throw new Error(
      "Push notifications require a Firebase development or production build.",
    );
  }
  return firebase;
}

async function getEndpoint(): Promise<PushEndpoint> {
  const { api, messaging } = getRequiredRuntime();
  let unsubscribe = () => {};
  let unsubscribeUnregistered = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const registration = new Promise<PushEndpoint>((resolve, reject) => {
    unsubscribe = api.onRegistered(messaging, (value) => {
      console.log("FCM ID: ", value);
      resolve({ provider: "fcm", kind: "fid", value });
    });
    unsubscribeUnregistered = api.onUnregistered(messaging, () => {
      reject(new Error("Firebase registration was cancelled."));
    });
  });

  // A callback may fail while the native register call is still in flight.
  void registration.catch(() => undefined);
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        cancelled = true;
        reject(
          new Error("Firebase registration timed out. Try again when online."),
        );
      }, REGISTRATION_TIMEOUT_MS);
    });
    function checkCancelled() {
      if (cancelled) throw new Error("Firebase registration was cancelled.");
    }
    const operation = async () => {
      if (!(await api.isSupported(messaging))) {
        throw new Error("Firebase Messaging is unavailable on this device.");
      }
      checkCancelled();
      if (
        Platform.OS === "ios" &&
        !api.isDeviceRegisteredForRemoteMessages(messaging)
      ) {
        await api.registerDeviceForRemoteMessages(messaging);
        checkCancelled();
      }
      await api.setAutoInitEnabled(messaging, true);
      checkCancelled();
      await api.register(messaging);
      return registration;
    };
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    unsubscribe();
    unsubscribeUnregistered();
  }
}

function listen(listeners: TransportListeners): () => void {
  const firebase = getFirebaseRuntime();
  if (!firebase) return () => {};
  const { api, messaging } = firebase;
  const subscriptions: (() => void)[] = [];

  function safely(run: () => void) {
    try {
      run();
    } catch (error) {
      listeners.onError(error);
    }
  }

  try {
    subscriptions.push(
      api.onMessage(messaging, (message) =>
        safely(() => listeners.onMessage(normalizeFirebaseMessage(message))),
      ),
    );
    subscriptions.push(
      api.onNotificationOpenedApp(messaging, (message) =>
        safely(() => listeners.onOpen(normalizeFirebaseMessage(message))),
      ),
    );
    subscriptions.push(
      api.onRegistered(messaging, (value) =>
        safely(() =>
          listeners.onEndpointChanged({ provider: "fcm", kind: "fid", value }),
        ),
      ),
    );
  } catch (error) {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    listeners.onError(error);
    // Registration must not proceed when receipt/open listeners could not be
    // installed. Let the service retain this startup failure until a retry.
    throw error;
  }

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export const firebaseTransport: NotificationTransport = {
  get supported() {
    return getFirebaseRuntime() !== null;
  },
  getPermission: getNotificationPermission,
  requestPermission: requestNotificationPermission,
  getEndpoint,
  listen,
  async getInitialNotification() {
    const firebase = getFirebaseRuntime();
    if (!firebase) return null;
    const message = await firebase.api.getInitialNotification(
      firebase.messaging,
    );
    return message ? normalizeFirebaseMessage(message) : null;
  },
  async unregister() {
    const firebase = getFirebaseRuntime();
    if (!firebase) return;
    await firebase.api.setAutoInitEnabled(firebase.messaging, false);
    await firebase.api.unregister(firebase.messaging);
  },
};
