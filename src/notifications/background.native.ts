import { createBackgroundProcessor } from "./core/background";
import { normalizeFirebaseMessage } from "./adapters/firebase.native";
import { getFirebaseRuntime } from "./adapters/firebaseRuntime.native";
import { notificationStorage } from "./adapters/storage";

const firebase = getFirebaseRuntime();
if (firebase) {
  const process = createBackgroundProcessor({
    storage: notificationStorage,
    // Add a headless-safe onReceive callback here when a project has server
    // synchronization. Fetch canonical data; never write tasks from push data.
    // Keep this module and that callback free of React and Router imports.
  });
  firebase.api.setBackgroundMessageHandler(firebase.messaging, async (message) => {
    await process(normalizeFirebaseMessage(message));
  });
}
