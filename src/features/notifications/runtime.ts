import { firebaseTransport } from "@/notifications/adapters/firebase";
import { notificationStorage } from "@/notifications/adapters/storage";
import { createNotificationService } from "@/notifications/core/createNotificationService";
import { Platform } from "react-native";

import { createAppNotificationHandlers } from "./handlers";
import { openTaskListFromNotification } from "./navigation";
import { createHttpRegistrationApi } from "./registrationApi";

export { isNotificationHeadless } from "@/notifications/adapters/firebase";

// This composition point is the only place that knows the app and push adapters.
export const notificationService = createNotificationService({
  transport: firebaseTransport,
  storage: notificationStorage,
  registrationApi: createHttpRegistrationApi({
    baseUrl: process.env.EXPO_PUBLIC_PUSH_REGISTRATION_URL,
    platform: Platform.OS,
  }),
  ...createAppNotificationHandlers({ openTasks: openTaskListFromNotification }),
});
