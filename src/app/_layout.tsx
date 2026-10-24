import "@/i18n";
import { isNotificationHeadless } from "@/features/notifications/runtime";
import { restoreLanguage } from "@/i18n/language";
import NotificationBootstrap from "@/notifications/react/NotificationBootstrap";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

export default function RootLayout() {
  const [interactive, setInteractive] = useState(false);
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    let active = true;
    void isNotificationHeadless()
      .then((headless) => {
        if (active) setInteractive(!headless);
      })
      .catch((error) => {
        console.warn("Notification startup failed:", error);
        // A broken optional native service must not leave the task app blank.
        if (active) setInteractive(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // iOS can mount React for a silent push; keep UI startup effects asleep.
    if (!interactive) return;
    let active = true;
    void restoreLanguage()
      .catch((err) => console.warn("Khôi phục ngôn ngữ thất bại: ", err))
      .finally(() => {
        if (active) setLangReady(true);
      });

    return () => {
      active = false;
    };
  }, [interactive]);

  if (!langReady) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#F8FAFC",
          },
          headerTintColor: "#0F172A",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ title: "About" }} />
      </Stack>
      <NotificationBootstrap />
    </>
  );
}
