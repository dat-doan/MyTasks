import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { withTranslation, WithTranslation } from "react-i18next";

function TabLayout({ t }: WithTranslation<"common">) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4F46E5",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t(($) => $.navigation.tasks),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: "checklist",
                android: "checklist",
                web: "checklist",
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: t(($) => $.navigation.tasks),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: "gearshape",
                android: "settings",
                web: "settings",
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default withTranslation("common")(TabLayout);
