import type { NotificationTransport } from "../core/types";

// Metro selects firebase.native.ts on mobile. This fallback deliberately has
// no Firebase/native imports, including during server rendering on web.
export const firebaseTransport: NotificationTransport = {
  supported: false,
  getPermission: async () => "unsupported",
  requestPermission: async () => "unsupported",
  getEndpoint: async () => {
    throw new Error("Push notifications are not supported on this platform.");
  },
  listen: () => () => {},
  getInitialNotification: async () => null,
  unregister: async () => {},
};

export async function isNotificationHeadless(): Promise<boolean> {
  return false;
}
