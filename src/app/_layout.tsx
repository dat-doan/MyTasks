import "@/i18n";
import { restoreLanguage } from "@/i18n/language";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

export default function RootLayout() {
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    let active = true;
    void restoreLanguage()
      .catch((err) => console.warn("Khôi phục ngôn ngữ thất bại: ", err))
      .finally(() => {
        if (active) setLangReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!langReady) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: "#F8FAFC",
        },
        headerTintColor: "#0F172A",
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "My Tasks", headerShown: false }}
      />
      <Stack.Screen name="about" options={{ title: "About" }} />
    </Stack>
  );
}
