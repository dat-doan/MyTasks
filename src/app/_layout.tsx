import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: "#F8FAFC",
        },
        headerTintColor: "#0F172A",
      }}
    >
      <Stack.Screen name="index" options={{ title: "My Tasks", headerShown: false }} />
      <Stack.Screen name="about" options={{ title: "About" }} />
    </Stack>
  );
}
